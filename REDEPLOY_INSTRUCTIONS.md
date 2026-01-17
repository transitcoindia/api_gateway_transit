# API Gateway Redeployment Instructions

## Automatic Deployment (Recommended)

The API Gateway on Render is configured for **auto-deployment** from GitHub. When you push changes to the `main` branch, Render automatically:

1. Detects the push
2. Pulls the latest code
3. Runs `npm install && npm run build`
4. Restarts the service with `npm start`

**Status:** Changes have been pushed to GitHub. Render should be deploying automatically.

**Deployment URL:** https://api-gateway-transit-iywb.onrender.com

---

## Manual Deployment (If Needed)

If auto-deployment doesn't work, you can manually trigger a deployment:

### Option 1: Via Render Dashboard

1. Go to https://dashboard.render.com
2. Navigate to your **api-gateway-transit** service
3. Click on **"Manual Deploy"** button
4. Select **"Clear build cache & deploy"** (optional, for clean build)
5. Wait for deployment to complete (usually 2-5 minutes)

### Option 2: Via Render API

If you have Render API access configured:

```bash
# Get your Render API token from: https://dashboard.render.com/account/api-keys
export RENDER_API_KEY="your_api_key_here"
export SERVICE_ID="your_service_id"  # Found in Render dashboard URL

# Trigger manual deploy
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": true}'
```

---

## Verify Deployment

After deployment, verify the changes are live:

### 1. Check Health Endpoint
```bash
curl https://api-gateway-transit-iywb.onrender.com/health
```

### 2. Test Ride Request Endpoint
```bash
curl -X POST https://api-gateway-transit-iywb.onrender.com/api/rider/request \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLatitude": 28.7041,
    "pickupLongitude": 77.1025,
    "dropLatitude": 28.5355,
    "dropLongitude": 77.3910,
    "rideType": "STANDARD"
  }'
```

### 3. Check Logs in Render Dashboard
- Go to your service in Render dashboard
- Click on **"Logs"** tab
- Look for deployment completion messages
- Check for any errors

---

## What Changed

The following changes were pushed to enable `/api/rider/*` routes:

1. **`src/middleware/proxy.ts`**: Added `/api/rider/` to wildcard matching
2. **`src/config/services.ts`**: Added `/api/rider` to transit service routes

These changes allow the API Gateway to properly route all `/api/rider/*` requests to the transit backend service.

---

## Deployment Time

- **Typical deployment time:** 2-5 minutes
- **Build time:** Usually 1-2 minutes (TypeScript compilation)
- **Service restart:** Usually completes within 30 seconds

---

## Troubleshooting

If the deployment fails:

1. Check **Render Dashboard** → **Logs** for error messages
2. Common issues:
   - Build errors (TypeScript compilation)
   - Missing environment variables
   - Dependency installation failures
3. Verify the service is running:
   - Check **Status** in Render dashboard
   - Should show "Live" status

---

## Post-Deployment Testing

After deployment completes, test the ride request endpoint:

```bash
POST https://api.transitco.in/api/rider/request
Authorization: Bearer <rider_token>
Content-Type: application/json

{
  "pickupLatitude": 28.7041,
  "pickupLongitude": 77.1025,
  "pickupAddress": "Connaught Place, New Delhi",
  "dropLatitude": 28.5355,
  "dropLongitude": 77.3910,
  "dropAddress": "India Gate, New Delhi",
  "rideType": "STANDARD"
}
```

This should now work without a 404 error.
