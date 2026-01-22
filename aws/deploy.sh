#!/bin/bash

# AWS API Gateway Deployment Script
# Usage: ./deploy.sh

set -e

# Configuration
AWS_REGION="ap-south-1"
AWS_ACCOUNT_ID="910162731533"
ECR_REPOSITORY="api-gateway-transit"
ECS_CLUSTER="transit-cluster"
ECS_SERVICE="api-gateway-transit-service"
ECS_TASK_DEFINITION="api-gateway-transit"
CONTAINER_NAME="api-gateway-transit"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting API Gateway deployment to AWS ECS...${NC}"

# Step 1: Login to ECR
echo -e "${YELLOW}Step 1: Logging into Amazon ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Step 2: Build Docker image
echo -e "${YELLOW}Step 2: Building Docker image...${NC}"
docker build -t ${ECR_REPOSITORY}:latest -f Dockerfile .

# Step 3: Tag image
echo -e "${YELLOW}Step 3: Tagging image...${NC}"
docker tag ${ECR_REPOSITORY}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest

# Step 4: Push to ECR
echo -e "${YELLOW}Step 4: Pushing image to ECR...${NC}"
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest

# Step 5: Update ECS service
echo -e "${YELLOW}Step 5: Updating ECS service...${NC}"
aws ecs update-service \
  --cluster ${ECS_CLUSTER} \
  --service ${ECS_SERVICE} \
  --force-new-deployment \
  --region ${AWS_REGION}

echo -e "${GREEN}✅ Deployment initiated successfully!${NC}"
echo -e "${YELLOW}Waiting for service to stabilize...${NC}"

# Wait for service to be stable
aws ecs wait services-stable \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE} \
  --region ${AWS_REGION}

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
