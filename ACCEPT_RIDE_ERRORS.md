# Why "Accept ride" gives an error

When `POST /api/gateway/rides/accept` returns **404** or **"Failed to persist ride details"**, the gateway tried to update both **rider backend** and **driver backend**; one or both failed.

## Causes and fixes

### 1. Rider backend fails (401 / no token)

- **Cause:** Rider token was not stored when the ride was **requested**. The gateway stores the rider’s `Authorization: Bearer <token>` only when the rider calls `POST /api/gateway/rides/request`.
- **Fix:** Rider app must send `Authorization: Bearer <rider_token>` when requesting a ride. If you test with Postman, send the rider token on the **request** call, not only on accept.

### 2. Rider backend fails (404 Ride not found)

- **Cause:** The ride does not exist in the **rider** backend DB (wrong `rideId`, or ride was created in another environment).
- **Fix:** Ensure the rider requested the ride through **this** gateway and rider backend. Same `rideId` must exist in the rider DB.

### 3. Driver backend fails (401 Driver not authenticated)

- **Cause:** Driver token is missing, wrong, or driver backend uses a different JWT secret than the one that issued the token.
- **Fix:**
  - Send `Authorization: Bearer <driver_token>` on `POST /api/gateway/rides/accept` (driver app / Postman).
  - Ensure gateway’s `DRIVER_BACKEND_URL` points to the **same** driver backend the driver logged in against (same JWT secret).

### 4. Driver backend fails (400 rideId and riderId are required)

- **Cause:** Gateway did not have `riderId` when storing ride details at request time, so the payload to driver backend was missing `riderId`.
- **Fix:** Rider backend now returns `riderId` in the `/request` response; gateway uses it. Ensure rider backend and gateway are up to date. Rider app can also send `riderId` in the request body when calling `/request`.

### 5. Wrong / unreachable backend URLs

- **Cause:** Gateway cannot reach rider or driver backend (wrong host, firewall, or gateway running in cloud with `localhost` in env).
- **Fix:** Set `RIDER_BACKEND_URL` and `DRIVER_BACKEND_URL` (or `driver_backend` / `DRIVER_SERVICE_URL`) to the **reachable** URLs (e.g. `https://backend.transitco.in` for rider, `https://api.transitco.in` for driver). If the gateway runs in the cloud, do **not** use `localhost`.

### 6. Ride details not found (404)

- **Cause:** Gateway has no stored ride for this `rideId` (e.g. gateway restarted, or ride was requested on another gateway instance).
- **Fix:** Rider must request the ride through the **same** gateway instance (or same deployment) that receives the accept call. Avoid multiple gateway instances without shared state unless you persist ride details (e.g. Redis).

## Check gateway logs

On accept, the gateway logs:

- `[ACCEPT] Rider backend failed: <status> <body>` – rider backend error.
- `[ACCEPT] Driver backend failed: <status> <body>` – driver backend error.
- `[RIDE_REQUEST] No riderId ...` / `No rider access token ...` – missing data at request time.

Use these to see which backend failed and with what status/body.
