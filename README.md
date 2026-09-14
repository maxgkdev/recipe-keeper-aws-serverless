# Recipe Kepper Serverless PWA

Live Demo: [https://d2tjksce0qbw7r.cloudfront.net/]

Test Credentials: Click "Try the Recruiter Demo" on the login screen, or use guest@recipekeeper.com / HireMe2026!

---------------------

I originally built this app as a standalone frontend project using Supabase. As I started studying for my AWS Solutions Architect Associate (SAA) certification, I decided to take things a step further and migrate the entire project to a true AWS serverless architecture to put what I was learning into practice.

##  Architecture Blueprint
![AWS Architecture Diagram](docs/architecture-diagram.png)

##  What the App Does
It’s a Progressive Web App (PWA) built for saving and managing recipes. It has two main AI features:
1. **Camera Scan:** Snap a photo of a handwritten recipe, and Google Gemini extracts the text.
2. **Web Import:** Paste a link to a food blog, and it automatically strips away the ads and layout to extract just the recipe details. 

It also uses a Service Worker to cache data locally, meaning the app and your saved recipes still load perfectly even if you lose cell service at the grocery store.

## The AWS Migration

This project started as a simple frontend app, but I recently migrated the entire backend to AWS. I wanted to learn cloud architecture, secure my AI API keys, and solve some annoying CORS issues I was hitting with public web scrapers.

Here is how I rebuilt it:

**Infrastructure as Code (IaC):** I used Terraform to provision and manage the entire AWS environment so I could spin it up (and tear it down) easily from my terminal.

**Fixing CORS with AWS Lambda:** I moved the recipe-scraping logic off the frontend and into an AWS Lambda (Node.js) function behind API Gateway. This completely bypassed browser CORS blocks and made the AI extraction way more reliable.

**Adding Authentication (Cognito):** I added AWS Cognito to lock down the app. It issues JWT tokens so my family can share a single synchronized cookbook, while isolating guest users (like recruiters) into their own empty databases.

**Database & Storage:** I swapped out my original database for DynamoDB (partitioning the data by userId) and set up private S3 buckets for hosting the frontend and storing uploaded recipe photos.

**Security First:** My Google Gemini API key used to be exposed in the frontend. Now, it is securely locked in AWS Secrets Manager, and my Lambda function uses strictly scoped IAM roles to access it.

**Global Delivery:** The frontend is distributed globally using Amazon CloudFront.
