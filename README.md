# Biz MuncH Backend API

The RESTful backend service powering Biz MuncH, a mobile platform that connects users with weekly rotating restaurant discounts. This Node.js/Express server handles user authentication, manages the Monday midnight restaurant rotation system, and serves as the single source of truth for all restaurant, menu, and discount data flowing to both the mobile app and admin dashboard.

**Frontend Repositories:**

- Mobile App (React Native): *Unfortunately the mobile app is not available for showcase*

- [Mobile App (React Native)](https://github.com/JamieJiHeonKim/bizmunch_mobile_app)
- [Admin Dashboard (React)](https://github.com/JamieJiHeonKim/bizmunch_dashboard_site)

### Application Workflow

1. **User Registration & Verification**
   - User registers via mobile app with company invitation code
   - Backend validates invitation code against Company collection
   - Generates 10 random restaurants for user's initial rotation
   - Sends OTP via email (Mailtrap/Nodemailer)
   - User verifies within 60 seconds (unverified accounts auto-delete via TTL index)

2. **Weekly Rotation (Automated)**
   - Node-cron job runs every Monday at midnight (`0 0 * * 1`)
   - Fetches all users from MongoDB
   - For each user: locks in 2 pinned restaurants, randomly selects 8 more
   - Updates user's rotation array (embedded restaurant data)
   - Mobile app queries updated rotation on next launch

3. **Pin/Unpin Favorites**
   - User pins a restaurant in mobile app (max 2)
   - Mobile app calls `POST /users/update-favorites` with restaurant IDs
   - Backend updates user's `favorites` array in MongoDB
   - Next Monday's rotation includes pinned restaurants + 8 random

4. **Admin Dashboard CRUD**
   - Admin uploads restaurant logo via dashboard
   - Dashboard sends multipart/form-data to `POST /users/dashboard/restaurants`
   - Backend saves logo to GridFS, restaurant metadata to MongoDB
   - Mobile app immediately queries updated restaurant list

5. **Menu & Discount Access**
   - Mobile app calls `GET /restaurant/:id/menu`
   - Backend populates menu from Menu collection
   - Streams menu item images from GridFS, converts to base64
   - Returns full menu with prices, calories, descriptions, discount barcodes

---

## Technologies Used

### Runtime & Framework
- **Node.js 18** - JavaScript runtime for non-blocking I/O
- **Express.js 4.19** - Minimal web framework with middleware pattern
- **dotenv** - Environment variable management

### Database & ODM
- **MongoDB 6.6** - NoSQL database for flexible schema and embedded documents
- **Mongoose 8.5** - ODM for schema validation, hooks, and relationships
- **GridFS + gridfs-stream** - MongoDB's file storage for restaurant logos and menu images (no AWS S3 dependency)

### Authentication & Security
- **bcrypt 5.1** - Password hashing with salt rounds (10 iterations)
- **jsonwebtoken 9.0** - JWT-based stateless authentication (1-year expiration)
- **express-validator 7.0** - Input validation and sanitization (prevents XSS)

### Email Service
- **Nodemailer 6.9** - Email sending library
- **Mailtrap 3.4** - Email testing/delivery service (SMTP + API)

### Scheduled Tasks
- **node-cron 3.0** - In-process cron jobs for weekly rotation

### Utilities
- **cors 2.8** - Cross-origin resource sharing for dashboard + mobile app
- **axios 1.6** - HTTP client for external API calls (if needed)

---

## System Architecture

### Design Rationale

This backend was architected to support **automated weekly rotations**, **real-time data synchronization**, and **stateless authentication** for a B2B restaurant discount platform.

**Key Design Decisions:**

1. **MVC Pattern (Models → Controllers → Routes)**
   - **Why:** Clear separation of concerns - easy to debug and extend
   - **Usage:** Route defines endpoint → Controller handles business logic → Model enforces schema → MongoDB stores data
   - **Example:** User reports rotation issue → Check `userRoutes.js` (cron job) → `userController.js` (rotation algorithm) → `userModel.js` (schema)

2. **GridFS for Image Storage (No Cloud Provider)**
   - **Why:** Keeps everything in MongoDB, no S3/Cloudinary API keys, simpler deployment
   - **Tradeoff:** Slower retrieval than CDN, but acceptable for admin uploads
   - **Usage:** Admin uploads logo → Multer receives file → Backend streams to GridFS → Stores file ID in Restaurant document → Mobile app retrieves as base64

3. **Embedded Rotation Array (Denormalization)**
   - **Why:** Faster reads - one query gets user + 10 restaurants (no joins)
   - **Tradeoff:** Restaurant data duplicated across users (storage cost), potential staleness if restaurant name changes
   - **Usage:** User opens app → `GET /users/rotated-restaurants/:userId` → Mongoose populates rotation array → Returns 10 restaurants with logos in single query

4. **TTL Indexes for Auto-Deletion**
   - **Why:** Prevent database bloat from users who register but never verify email
   - **Usage:** User registers → `expireAt` field set to 60 seconds from now → MongoDB background process deletes after expiration → User must verify quickly

5. **Node-Cron for Weekly Rotation**
   - **Why:** No external cron service needed, runs inside Node process
   - **Tradeoff:** If server restarts at midnight, job reschedules (but still runs on time)
   - **Usage:** Cron job defined in `userRoutes.js:46-53` → Runs `0 0 * * 1` (Monday midnight) → Calls `updateRotation()` for all users → Updates user.rotation arrays → Mobile users see new restaurants

6. **Mongoose Pre-Save Hooks for Password Hashing**
   - **Why:** Ensures passwords *never* stored in plaintext, even if developer forgets to hash manually
   - **Usage:** User registers/changes password → Mongoose intercepts save operation → Checks if password modified → Hashes with bcrypt (10 salt rounds) → Saves hashed password

7. **JWT Stateless Authentication (1-Year Expiration)**
   - **Why:** Mobile apps need long-lived tokens (no re-login hassle), no server-side session storage
   - **Tradeoff:** Can't invalidate tokens server-side (must wait for expiration)
   - **Usage:** User logs in → Backend generates JWT with user ID → Mobile app stores in AsyncStorage → Sends in Authorization header on every request

8. **Company Invitation System (B2B Access Control)**
   - **Why:** Biz MuncH is B2B - companies buy subscriptions, employees get accounts (no open public registration)
   - **Usage:** Admin creates company with invitation code → Employees register with that code → Backend validates code before creating account

**Real-World Usage:**
- User registers with company code → Receives 10 random restaurants → Pins 2 favorites → Monday midnight rotation runs → 2 pinned restaurants stay, 8 new random restaurants added → User opens app on Monday morning → Sees updated rotation with pinned restaurants at top → Taps restaurant → Views menu with discount barcodes → Redeems at checkout

### High-Level Design

```
┌────────────────────────────────────────────────────────────┐
│                      Client Layer                          │
│  ┌─────────────┐   ┌─────────────┐    ┌─────────────┐      │
│  │  Mobile App │   │   Admin     │    │  Manager    │      │
│  │   (React    │   │  Dashboard  │    │  Dashboard  │      │
│  │   Native)   │   │   (React)   │    │   (React)   │      │
│  └──────┬──────┘   └──────┬──────┘    └──────┬──────┘      │
│         │                 │                  │             │
│         └─────────────────┼──────────────────┘             │
│                           │ HTTPS (JWT Bearer Token)       │
└───────────────────────────┼────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│              Backend API Server (Node.js/Express)          │
│  ┌────────────────────────────────────────────────────┐    │
│  │                Express.js Middleware               │    │
│  │  • cors()           • express.json()               │    │
│  │  • express-validator • JWT Auth (future)           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │                    Routes Layer                    │    │
│  │  • /users           → userRoutes.js                │    │
│  │  • /restaurant      → restaurantRoutes.js          │    │
│  │  • /company         → companyRoutes.js             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │                 Controllers Layer                  │    │
│  │  • userController.js      (register, login, etc.)  │    │
│  │  • restaurantController.js (get restaurants)       │    │
│  │  • menuController.js      (get/create menus)       │    │
│  │  • companyController.js   (CRUD companies)         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │                   Models Layer                     │    │
│  │  • userModel.js        (AppUser schema)            │    │
│  │  • restaurantModel.js  (Restaurant schema)         │    │
│  │  • menuModel.js        (Menu schema)               │    │
│  │  • companyModel.js     (Company schema)            │    │
│  │  • VerificationToken.js (OTP schema)               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │                  Utilities Layer                   │    │
│  │  • mail.js             (email templates)           │    │
│  │  • errorHandlers.js    (error middleware)          │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Scheduled Tasks (Cron)                │    │
│  │  • Weekly Rotation (0 0 * * 1)                     │    │
│  │    → Runs updateRotation() for all users           │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────────┬────────────────────────────────┘
                            │ Mongoose ODM
                   ┌────────▼─────────┐
                   │   MongoDB Atlas  │
                   │                  │
                   │  Collections:    │
                   │  • appusers      │
                   │  • restaurants   │
                   │  • menus         │
                   │  • companies     │
                   │  • tokens        │
                   │                  │
                   │  GridFS:         │
                   │  • uploads.files │
                   │  • uploads.chunks│
                   └──────────────────┘
```

### Project Structure

```
bizmunch_app_services/
├── server.js                 # Express app, MongoDB connection, GridFS setup
│
├── routes/
│   ├── userRoutes.js         # POST /users/register, /auth, /verify-email
│   │                         # GET /users/rotated-restaurants/:userId
│   │                         # POST /users/update-favorites
│   │                         # Cron job: Weekly rotation (0 0 * * 1)
│   ├── restaurantRoutes.js   # GET /restaurant/allrestaurants
│   │                         # GET /restaurant/:id/menu
│   └── companyRoutes.js      # POST /company/register, GET /company/all
│
├── controllers/
│   ├── userController.js     # userRegister(), verifyEmail(), userLogIn()
│   │                         # updateFavorites(), updateRotation()
│   │                         # getRotatedRestaurants(), getPinnedRestaurants()
│   ├── restaurantController.js # getRestaurants() with GridFS image streaming
│   ├── menuController.js     # getMenu(), createMenu()
│   └── companyController.js  # Company CRUD operations
│
├── models/
│   ├── userModel.js          # AppUser schema: email, password, favorites, rotation
│   │                         # Pre-save hook: bcrypt password hashing
│   │                         # TTL index: expireAt (auto-delete unverified users)
│   ├── restaurantModel.js    # Restaurant schema: name, location, category, logo, menuId
│   ├── menuModel.js          # Menu schema: nested categories → items
│   ├── companyModel.js       # Company schema: name, invitationCode
│   └── VerificationToken.js  # OTP token schema: owner, token (hashed), expiration
│
├── utils/
│   ├── mail.js               # generateOTP(), mailTransport(), email templates
│   └── errorHandlers.js      # Centralized error handling middleware
│
├── .env                      # MONGO_URI, JWT_SECRET, MAILTRAP_TOKEN
├── package.json              # Dependencies and npm scripts
└── LICENSE
```

### Data Flow

1. **User Registration Flow**
   ```
   Mobile App: POST /users/register { email, password, invitation }
   → Express Validator: Check email format, password length
   → Controller: Validate invitation code (Company.findOne({ invitationCode }))
   → Controller: Fetch all restaurants, shuffle, pick 10 random
   → Controller: Create AppUser with embedded rotation array
   → Mongoose Pre-Save Hook: Hash password with bcrypt
   → MongoDB: Save user (expireAt = 60 seconds)
   → Controller: Generate OTP, hash with bcrypt, save to VerificationToken
   → Nodemailer: Send verification email via Mailtrap
   → Response: { message, user }
   → User verifies within 60 seconds, else TTL index deletes account
   ```

2. **Weekly Rotation Flow**
   ```
   Cron Job (0 0 * * 1): Triggers every Monday at midnight
   → Fetch all users: AppUser.find()
   → For each user:
     → Fetch user.favorites (pinned restaurant IDs)
     → Fetch all restaurants: Restaurant.find()
     → Map favorites to full restaurant objects (embed data)
     → Filter remaining restaurants (exclude pinned)
     → Shuffle: remainingRestaurants.sort(() => 0.5 - Math.random())
     → Slice: remainingSlots = 10 - favorites.length
     → Update: user.rotation = [...favorites, ...random]
     → Save user
   → Log: "Weekly rotation update done"
   → Mobile users see updated rotation on next app launch
   ```

3. **Pin Restaurant Flow**
   ```
   Mobile App: POST /users/update-favorites { userId, restaurantIds: [id1, id2] }
   → Controller: Find user by ID
   → Controller: Replace user.favorites array with restaurantIds
   → MongoDB: Update user document
   → Response: { message, favorites }
   → Mobile App: Update local state, show pin icon
   → Next Monday: Rotation includes pinned restaurants
   ```

4. **Get Rotated Restaurants with Images Flow**
   ```
   Mobile App: GET /users/rotated-restaurants/:userId
   → Controller: Find user, populate rotation.restaurantId
   → For each restaurant in rotation:
     → GridFS: Find logo file by ID
     → GridFS: Open download stream
     → Event Emitter: Collect chunks on 'data' event
     → Event Emitter: Concatenate on 'end' event
     → Convert buffer to base64: buffer.toString('base64')
     → Wrap in data URL: data:image/png;base64,${base64}
   → Response: Array of restaurants with inline base64 logos
   → Mobile App: Render restaurant cards with <Image source={{ uri: logo }} />
   ```

### Key Design Patterns

- **MVC Pattern:** Routes → Controllers → Models → MongoDB (clear separation of concerns)
- **Middleware Chain:** CORS → JSON Parser → Routes → Error Handler
- **Factory Pattern:** Email template generators (generateEmailTemplate, generatePasswordResetTemplate)
- **Repository Pattern (Implicit):** Controllers use Mongoose models, never raw MongoDB queries
- **Schema Hooks:** Pre-save hooks for password hashing, expireAt cleanup
- **Scheduled Task Pattern:** Cron job defined in routes, calls controller function
- **Stream Processing:** GridFS streams for file retrieval (memory-efficient)

---

## API Endpoints

### Authentication Endpoints

```javascript
POST /users/register
Body: { firstName, lastName, email, password, company, invitation }
Returns: { message, user }

POST /users/verify-email
Body: { userId, otp }
Returns: { message: "Email verified successfully" }

POST /users/auth
Body: { email, password }
Returns: { message, token, user: { id, name, email, company }, pinnedRestaurants }

POST /users/forgot-password
Body: { email }
Returns: { message: "Password reset OTP sent" }

POST /users/verify-forgot-password
Body: { email, verificationCode, newPassword }
Returns: { message: "Password reset successful" }

POST /users/update-password
Body: { userId, currentPassword, newPassword }
Returns: { error: false, message: "Password updated successfully" }
```

### Restaurant Endpoints

```javascript
GET /restaurant/allrestaurants
Returns: [{ _id, name, category, location, logo: "data:image/png;base64,..." }, ...]

GET /restaurant/:id/menu
Returns: { _id, restaurantName, menu: { Appetizers: [...], Entrees: [...] } }

POST /restaurant/createmenu
Body: { restaurantId, menu: { category: [items] } }
Returns: { message: "Menu created successfully", menu }
```

### User-Specific Endpoints

```javascript
GET /users/rotated-restaurants/:userId
Returns: [{ _id, name, category, location, logo: "base64..." }, ...] (10 restaurants)

POST /users/update-favorites
Body: { userId, restaurantIds: [id1, id2] } (max 2)
Returns: { message: "Favorites updated successfully", favorites }

GET /users/get-pinned-restaurants/:userId
Returns: [restaurantId1, restaurantId2] (just IDs)
```

### Company Endpoints

```javascript
POST /company/register
Body: { name, invitationCode }
Returns: { message, company }

GET /company/all
Returns: [{ _id, name, invitationCode }, ...]
```

### Response Format

**Success:**
```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "Error message",
  "message": "Error description"
}
```

**HTTP Status Codes:**
- `200 OK` - Successful GET
- `201 Created` - Successful POST (resource created)
- `400 Bad Request` - Validation failed
- `403 Forbidden` - Wrong password
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Duplicate email
- `500 Internal Server Error` - Server error

---

## Installation & Development

### Prerequisites
- Node.js 18+
- MongoDB 6.6+ (local or Atlas cloud)
- Mailtrap account (free tier)

### Environment Variables

Create `.env` in root:

```bash
# MongoDB connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=bizmunch

# JWT secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_secret_key_here

# Mailtrap API token
MAILTRAP_TOKEN=your_mailtrap_token_here

# Server port
PORT=5000
```

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs at http://localhost:5000
```

### Testing Endpoints (cURL)

```bash
# Register user
curl -X POST http://localhost:5000/users/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"John","lastName":"Doe","email":"john@example.com","password":"password123","company":"company_id","invitation":"COMPANY_CODE"}'

# Login
curl -X POST http://localhost:5000/users/auth \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Get rotated restaurants
curl http://localhost:5000/users/rotated-restaurants/user_id_here
```

---

## Deployment

### Heroku

```bash
heroku create bizmunch-api
heroku config:set MONGO_URI=your_connection_string
heroku config:set JWT_SECRET=your_secret
heroku config:set MAILTRAP_TOKEN=your_token
heroku config:set DB_NAME=bizmunch
git push heroku main
heroku logs --tail
```

### Railway

1. Connect GitHub repo to Railway
2. Set environment variables in dashboard
3. Railway auto-deploys on push

### Vercel (Serverless)

1. Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/server.js" }]
}
```
2. Deploy: `vercel --prod`
3. Set env vars in Vercel dashboard

**Note:** Cron job behavior varies:
- **Heroku:** Works if dyno always running (free dynos sleep → cron won't run)
- **Railway:** Always-on servers → cron works perfectly
- **Vercel:** Serverless → use Vercel Cron or external service

---

## MongoDB Collections

### appusers (User Accounts)
```javascript
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  email: String (unique),
  password: String (bcrypt hashed),
  company: ObjectId (ref: Company),
  invitation: String,
  verified: Boolean,
  expireAt: Date (TTL index, auto-deletes after 60 seconds),
  favorites: [ObjectId] (max 2 restaurant IDs),
  rotation: [
    {
      restaurantId: ObjectId,
      name: String,
      location: String,
      category: String,
      logo: String (GridFS file ID)
    }
  ]
}
```

### restaurants
```javascript
{
  _id: ObjectId,
  restaurantId: Number,
  name: String (unique),
  location: String,
  managerName: String,
  managerEmail: String (unique),
  category: String,
  logo: String (GridFS file ID),
  menuId: ObjectId (ref: Menu),
  createdAt: Date,
  updatedAt: Date
}
```

### menus
```javascript
{
  _id: ObjectId,
  restaurantName: String,
  menu: {
    Appetizers: [
      { name: String, price: Number, description: String, calories: Number, image: String }
    ],
    Entrees: [...],
    Desserts: [...]
  }
}
```

### companies
```javascript
{
  _id: ObjectId,
  name: String,
  invitationCode: String (unique)
}
```

### verificationtokens (OTP Tokens)
```javascript
{
  _id: ObjectId,
  owner: ObjectId (ref: AppUser),
  token: String (bcrypt hashed),
  createdAt: Date (TTL index, expires after 5 minutes)
}
```

### uploads.files & uploads.chunks (GridFS)
- `uploads.files`: Metadata (filename, uploadDate, length, contentType)
- `uploads.chunks`: Binary data (255KB chunks)

---

## Technical Highlights

**Automated Cron System**
- Weekly rotation runs every Monday at midnight for all users simultaneously
- Handles core business logic without manual intervention

**GridFS Image Management**
- Used MongoDB GridFS instead of S3/Cloudinary
- Streams images as base64 for inline API responses

**Security-First Auth**
- bcrypt password hashing with Mongoose pre-save hooks
- JWT-based authentication
- OTP email verification with hashed tokens
- TTL indexes for auto-deleting unverified accounts

**Denormalized Schema Design**
- Embedded restaurant data in user's rotation array for faster reads
- Accepted data duplication for performance

**RESTful API Design**
- 15+ endpoints with proper HTTP status codes
- Consistent error handling
- Input validation with express-validator
- MVC pattern for maintainability

**Transactional Email System**
- Nodemailer + Mailtrap for email verification and password reset
- OTP generation with hashed tokens
- One-time use tokens with expiration

---

## License

MIT License - See LICENSE file for details

---

**Note:** This is the backend API only. The mobile app (React Native) and admin dashboard (React) are in separate repositories.
