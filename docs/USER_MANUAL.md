# FairRoom — Intelligent Housing Allocation System: User Manual

## Start the Application

Backend:

```powershell
cd "C:\Users\vedant\OneDrive\Desktop\Projects\FairRoom"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend, in a second terminal:

```powershell
cd "C:\Users\vedant\OneDrive\Desktop\Projects\FairRoom\frontend"
npm.cmd run dev
```

Open `http://127.0.0.1:5173`.

## Admin Workflow

1. On the welcome page choose **Admin Login** and use `admin@example.com` / `admin123` locally. Change these environment-configurable defaults before any real deployment.
2. Use **Add Building** to enter the building, society, project, address and location. Select it from **Current Building**.
3. Use the building controls to edit details or archive an unused building.
4. Open **Resident Registration**. Enter the resident data, consent and optional document name. Optionally set a portal password of at least 12 characters; the new resident's numeric login ID is shown after saving. For an existing resident, use **Set portal password** in the resident list. Share the ID and password privately. Resolve duplicate ID, old-room or contact errors.
5. Use **Verify** after reviewing documents, or **Reject** when the record is ineligible.
6. Open **Room Management** and add room number, wing, floor, size, status and suitability.
7. On Dashboard or Draw History choose **Create New Draw Cycle**. Enter a name, optional phase/date, required reason and notes.
8. In **Draw Cycle Setup**, include verified, unallocated residents and unused available rooms. Previously allocated residents require a reason and confirmation through the protected override API; previously allocated rooms cannot be reused.
9. Review live totals. Choose **Confirm Eligibility and Mark Ready**. Fix any readable capacity or eligibility error.
10. Open **Lottery Draw**. Review draw reference, counts and status, then confirm Start. The page shows countdown/progress and the stored seed.
11. Use **Allocation Results** to expand the AI-style explanation.
12. Use **Resident History** for events and all participation. Use **Draw History** for each phase, details and historical downloads.
13. Open **Audit Logs** to review actions and reasons. Open **Transparency Report** for current exports.
14. Download CSV, PDF or Transparency Certificate from the relevant current/historical screen.
15. Select **Logout** when finished.

## Building Map Location

The Home Dashboard shows the selected building's **Building Location** after the building summary and statistics. Switching **Current Building** immediately removes the previous map details, shows a loading state and then displays the newly selected building. On tablet and mobile the map appears above the details and all actions use full-width, touch-friendly controls.

Administrators can choose **Edit Map Location**, or open **Map Location** while adding/editing a building:

1. Enter optional latitude (`-90` to `90`), longitude (`-180` to `180`) and zoom (`3` to `20`), or choose **Select Location on Map**.
2. Click a map point or drag the marker. Use **Find Location from Address** when the configured Google Maps service supports lookup.
3. Review and explicitly confirm an address-lookup result.
4. Choose **Clear Location** to return to `Not Set`.
5. Save. A changed location creates a `Building Map Location Updated` audit entry.

A building can always be saved without coordinates. **Open in Google Maps** and **Get Directions** use coordinates when available and otherwise use the encoded address; Google Maps/the device handles navigation and the starting point. **Copy Address** copies the displayed address. No in-application route or current-location request is made.

Location statuses are `Not Set`, `Located`, `Manual` and `Failed`. The standard map offers roadmap/satellite, zoom, drag/pan and fullscreen. It does not include 3D, Street View or in-app directions.

## Resident Portal

1. On the welcome page choose **Resident Login**. Enter the resident ID and password provided by the administrator.
2. **Dashboard** shows your building, verification, current eligibility and priority points, latest draw result, allocation and recent history.
3. **My Profile** shows your own details with a masked Aadhaar/ID. **My Eligibility** explains the active building criteria and awarded priority points.
4. **My Lottery** shows your own draw participation, result and waiting-list position when recorded. **My Allocation** shows your own room if allocated. **My History** shows events already recorded in FairRoom.
5. Choose **Logout** when finished. Five wrong passwords temporarily lock the account for 15 minutes; ask the administrator to reset the password if needed.

## Admin Resident Search

While signed in as Admin, open **Resident Search**, select a building, enter an exact old-room number or the last four ID digits and choose Search. The screen displays masked identity, allocation, completed draw participation and explanations. Residents use their own private portal instead.

## Demo Reset

The Dashboard reset button requires login and confirmation. It clears current demo allocations and unlocks current setup. Once permanent history exists, completed draw snapshots and linked residents are preserved. Always back up meaningful data first.

## Common Errors

| Message/problem | Solution |
|---|---|
| Admin session missing/expired | Log in again. |
| Duplicate Aadhaar/ID | Find the existing resident; hashes are globally unique. |
| Duplicate old room | Use a unique old room within the selected building. |
| No eligible resident/room | Verify a resident and include at least one unused available room. |
| More residents than rooms | Select **Competitive Lottery** when creating the draw cycle; include all eligible residents and the system will select winners up to the included room count. Enable Waiting List if non-winners should receive deterministic positions. |
| Active cycle already exists | Continue or cancel that cycle before creating another. |
| Room already allocated | Select a different room; historical rooms cannot be reused. |
| Completed history locked | View/download it; do not attempt to edit it. |
| Frontend cannot connect | Confirm backend port 8000 and frontend API configuration. |
| Google Maps is not configured | Add a restricted browser key to `frontend/.env`, enable Maps and restart Vite. |
| Building map is currently disabled | Set `VITE_GOOGLE_MAPS_ENABLED=true` and restart Vite. |
| Map location not configured | Edit the selected building and choose or enter coordinates. |
| Building location temporarily unavailable | Check network access, billing, API enablement and key/referrer restrictions; the rest of the Dashboard remains usable. |
| Address could not be located | Review all address fields or select the point manually. |
