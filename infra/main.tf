
# S3 BUCKET FOR FRONTEND HOSTING

# Generate a random suffix so the bucket name is globally unique
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "frontend_bucket" {
  bucket = "recipe-keeper-frontend-${random_id.bucket_suffix.hex}"
}

# ENTERPRISE SECURITY: Block all direct public access to the S3 bucket
resource "aws_s3_bucket_public_access_block" "frontend_block" {
  bucket                  = aws_s3_bucket.frontend_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


# CLOUDFRONT CDN (Global Edge Delivery)

# Modern Origin Access Control (OAC) to securely connect to S3
resource "aws_cloudfront_origin_access_control" "frontend_oac" {
  name                              = "recipe-keeper-oac-${random_id.bucket_suffix.hex}"
  description                       = "OAC for Recipe Keeper Frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.frontend_bucket.id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend_oac.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = aws_s3_bucket.frontend_bucket.id
    viewer_protocol_policy = "redirect-to-https"
    
    # AWS Managed Caching Policy (Optimized for standard web assets)
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" 
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}


# S3 BUCKET POLICY (Grant CloudFront Access)

# This policy tells S3: "Only allow read requests if they come from our specific CloudFront distribution"
resource "aws_s3_bucket_policy" "frontend_bucket_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend_bucket.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend_cdn.arn
          }
        }
      }
    ]
  })
}



# DYNAMODB TABLE (Recipe Database)

resource "aws_dynamodb_table" "recipes_table" {
  name         = "recipe-keeper-data"
  billing_mode = "PAY_PER_REQUEST" 
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}


# S3 BUCKET (Recipe Photos Storage)

resource "aws_s3_bucket" "photos_bucket" {
  bucket = "recipe-keeper-photos-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "photos_block" {
  bucket                  = aws_s3_bucket.photos_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}


# SECRETS MANAGER (Gemini API Key Vault)

resource "aws_secretsmanager_secret" "gemini_key" {
  name        = "recipe-keeper/gemini-api-key"
  description = "Google Gemini API Key for Recipe Keeper OCR"
}

# Sets a dummy value initially so the real key never enters version control
resource "aws_secretsmanager_secret_version" "gemini_key_version" {
  secret_id     = aws_secretsmanager_secret.gemini_key.id
  secret_string = "INITIAL_DUMMY_VALUE_DO_NOT_OVERWRITE"
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}


# LAMBDA IAM ROLE (Least Privilege Security)

resource "aws_iam_role" "lambda_exec_role" {
  name = "recipe-keeper-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_policy" "lambda_policy" {
  name        = "recipe-keeper-lambda-policy"
  description = "Grants Lambda access to DynamoDB, S3, Secrets Manager, and CloudWatch"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.recipes_table.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.photos_bucket.arn}/*"
      },
      {
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = aws_secretsmanager_secret.gemini_key.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy_attach" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}


# 8. ARCHIVE BACKEND CODE

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend"
  output_path = "${path.module}/lambda.zip"
}


# AWS LAMBDA FUNCTION

resource "aws_lambda_function" "api_lambda" {
  function_name    = "recipe-keeper-backend"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.recipes_table.name
      SECRET_ID  = aws_secretsmanager_secret.gemini_key.name
    }
  }
}


# API GATEWAY (HTTP API v2)
resource "aws_apigatewayv2_api" "http_api" {
  name          = "recipe-keeper-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "api_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api_lambda.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Grant API Gateway permission to trigger Lambda
resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}