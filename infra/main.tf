
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