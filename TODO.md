# CuraLink TODO - Fix API Errors

## Completed
- [x] Fix notifications 500 error - Added required `title` field to notification insert in `services/notification-service.js`
- [x] Fix locations 404 error - Added root "/" route in `routes/locations.js`

## Issues Fixed:
1. **Issue: `/api/notifications/unread-count` returning 500**
   - Root Cause: `notification-service.js` was inserting notifications without the required `title` field
   - Fix: Added `title` field to the INSERT statement (using first 100 chars of message)

2. **Issue: `/api/locations` returning 404**
   - Root Cause: No root route "/" existed in the locations router (routes defined were /locations which became /api/locations/locations)
   - Fix: Added "/" route that returns locations for authenticated user

## Testing Needed:
1. Test `/api/notifications/unread-count` - should return JSON with count
2. Test `/api/locations` - should return locations array
3. Test location features in the UI
