import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });

const TABLE_NAME = process.env.TABLE_NAME;
const SECRET_ID = process.env.SECRET_ID;

// Cache the secret across Lambda warm invocations
let cachedGeminiKey = null;

async function getGeminiKey() {
  if (cachedGeminiKey) return cachedGeminiKey;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  cachedGeminiKey = res.SecretString;
  return cachedGeminiKey;
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;

  // Handle CORS preflight requests
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // 1. GET /recipes — Fetch all recipes
    if (method === "GET" && path.endsWith("/recipes")) {
      const data = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data.Items || [])
      };
    }

    // 2. POST /recipes — Create or update a recipe
    if (method === "POST" && path.endsWith("/recipes")) {
      const recipe = JSON.parse(event.body || "{}");
      if (!recipe.id) {
        recipe.id = Date.now().toString();
      }
      recipe.updatedAt = new Date().toISOString();

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: recipe }));
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(recipe)
      };
    }

    // 3. DELETE /recipes/{id} — Delete a recipe
    if (method === "DELETE" && path.includes("/recipes/")) {
      const id = path.split("/").pop();
      await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Recipe deleted", id })
      };
    }

    // 4. POST /ai/extract — Gemini OCR / Recipe Extraction
    if (method === "POST" && path.endsWith("/ai/extract")) {
      const { prompt, imageBase64, targetUrl } = JSON.parse(event.body || "{}");
      const apiKey = await getGeminiKey();

      let extractedText = "";
      
      // NEW: Lambda fetches the webpage directly (Bypassing CORS entirely!)
      if (targetUrl) {
        const webRes = await fetch(targetUrl, { 
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } 
        });
        const rawHtml = await webRes.text();
        // Remove scripts/styles to save AI tokens, keep up to 30,000 chars
        extractedText = rawHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                               .substring(0, 30000);
      }

      const contents = [];
      const parts = [{ 
        text: (prompt || "Extract this recipe...") + (extractedText ? `\n\nWebsite text: ${extractedText}` : "") 
      }];

      if (imageBase64) {
        parts.push({
          inline_data: {
            mime_type: "image/jpeg",
            data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, "")
          }
        });
      }
      contents.push({ parts });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      });

      const result = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    }

    // 5. Fallback 404
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: `Not found: ${method} ${path}` })
    };

  // MISSING CATCH BLOCK AND CLOSING BRACKET RESTORED HERE
  } catch (err) {
    console.error("Lambda handler error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};