# API Gateway AWS Deployment Guide

This guide walks you through deploying the API Gateway to AWS ECS.

## Prerequisites

1. AWS CLI installed and configured
2. Docker installed
3. AWS account with appropriate permissions
4. ECS Cluster created (`transit-cluster`)

## Step 1: Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name api-gateway-transit \
  --region ap-south-1 \
  --image-scanning-configuration scanOnPush=true
```

## Step 2: Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/api-gateway-transit \
  --region ap-south-1
```

## Step 3: Create Secrets in AWS Secrets Manager

You need to create these secrets in AWS Secrets Manager:

```bash
# JWT_SECRET (should already exist from backend)
aws secretsmanager describe-secret --secret-id JWT_SECRET --region ap-south-1

# DRIVER_SERVICE_URL
aws secretsmanager create-secret \
  --name DRIVER_SERVICE_URL \
  --secret-string "https://api.transitco.in" \
  --region ap-south-1

# RIDER_BACKEND_URL
aws secretsmanager create-secret \
  --name RIDER_BACKEND_URL \
  --secret-string "https://backend.transitco.in" \
  --region ap-south-1

# REDIS_URL (should already exist)
aws secretsmanager describe-secret --secret-id REDIS_URL --region ap-south-1
```

## Step 4: Register Task Definition

```bash
cd aws
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region ap-south-1
```

## Step 5: Create ECS Service

First, get your subnet IDs and security group ID:

```bash
# Get default VPC subnets
aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query "Subnets[*].[SubnetId,AvailabilityZone]" \
  --output table \
  --region ap-south-1

# Get or create security group
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=api-gateway-ecs-sg" \
  --region ap-south-1
```

If security group doesn't exist, create it:

```bash
aws ec2 create-security-group \
  --group-name api-gateway-ecs-sg \
  --description "Security group for API Gateway ECS tasks" \
  --region ap-south-1

# Allow inbound HTTP traffic (port 3005)
aws ec2 authorize-security-group-ingress \
  --group-id <SECURITY_GROUP_ID> \
  --protocol tcp \
  --port 3005 \
  --cidr 0.0.0.0/0 \
  --region ap-south-1
```

Create the ECS service:

```bash
aws ecs create-service \
  --cluster transit-cluster \
  --service-name api-gateway-transit-service \
  --task-definition api-gateway-transit \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --region ap-south-1
```

## Step 6: Create Application Load Balancer (Optional but Recommended)

If you want to use a load balancer:

1. Create a target group
2. Create an ALB
3. Update the ECS service to use the target group

## Step 7: Deploy

### Option A: Using the deployment script

```bash
chmod +x aws/deploy.sh
./aws/deploy.sh
```

### Option B: Manual deployment

```bash
# Build and push image
docker build -t api-gateway-transit:latest .
docker tag api-gateway-transit:latest 910162731533.dkr.ecr.ap-south-1.amazonaws.com/api-gateway-transit:latest
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 910162731533.dkr.ecr.ap-south-1.amazonaws.com
docker push 910162731533.dkr.ecr.ap-south-1.amazonaws.com/api-gateway-transit:latest

# Update ECS service
aws ecs update-service \
  --cluster transit-cluster \
  --service api-gateway-transit-service \
  --force-new-deployment \
  --region ap-south-1
```

### Option C: Using GitHub Actions

Push to main branch and the workflow will automatically deploy.

## Step 8: Verify Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster transit-cluster \
  --services api-gateway-transit-service \
  --region ap-south-1

# View logs
aws logs tail /ecs/api-gateway-transit --follow --region ap-south-1
```

## Environment Variables

The following environment variables are pulled from AWS Secrets Manager:

- `JWT_SECRET` - JWT signing secret (must match backend)
- `DRIVER_SERVICE_URL` - Driver backend URL
- `RIDER_BACKEND_URL` - Rider backend URL  
- `REDIS_URL` - Redis connection URL (optional)

## Troubleshooting

### Service won't start
- Check CloudWatch logs: `/ecs/api-gateway-transit`
- Verify secrets exist in Secrets Manager
- Check security group allows traffic on port 3005

### Connection issues to backends
- Verify backend URLs are correct in Secrets Manager
- Check security groups allow outbound traffic
- Test backend connectivity from ECS task

### Image pull errors
- Verify ECR repository exists
- Check IAM role has ECR permissions
- Verify image was pushed successfully
