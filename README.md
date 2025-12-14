# Biz MuncH Backend API

The RESTful backend service powering Biz MuncH, a mobile platform that connects users with weekly rotating restaurant discounts. This Node.js/Express server handles user authentication, manages the Monday midnight restaurant rotation system, and serves as the single source of truth for all restaurant, menu, and discount data flowing to both the mobile app and admin dashboard.

## Overview

This backend sits at the center of the Biz MuncH ecosystem, orchestrating data between MongoDB, the React Native mobile app, and the React admin dashboard. Every restaurant added by admins, every user registration, every pin action, and every weekly rotation happens here.

**The problem this solves:** Coordinating restaurant discount distribution across hundreds or thousands of users while maintaining data consistency. The weekly rotation needs to happen reliably at midnight every Monday for all users simultaneously. Users need their pinned restaurants to persist across rotations. Restaurant logos and menu images need to be served quickly without relying on third-party hosting. This API handles all of that.

## System Architecture

### The Ecosystem

```
Mobile App (React Native) ⟷ REST API (This Repo) ⟷ MongoDB ⟷ Dashboard (React)
```

This backend is the **bridge between three key components**:
- **Mobile App**: Consumes API endpoints for authentication, restaurant lists, menus, and pinning
- **MongoDB**: Stores users, restaurants, menus, companies, and images (via GridFS)
- **Admin Dashboard**: Uses API to create/update restaurants, upload images, and manage user invitations

When an admin uploads a restaurant logo in the dashboard, it hits this API, gets stored in MongoDB GridFS, and immediately becomes available to mobile users. When a user pins a restaurant on Monday morning, the API updates MongoDB and ensures that restaurant appears in Tuesday's rotation.

### Architecture Pattern: MVC with Service Layer

```
Routes (API Endpoints) → Controllers (Business Logic) → Models (Data Schema) → MongoDB
                                ↓
                      Utils (Mail, Validation, Error Handling)
```

**Why MVC?** Coming from a React background where component structure is everything, I wanted the backend to have clear separation of concerns:
- **Routes** define the API surface (what endpoints exist)
- **Controllers** contain business logic (what happens when you hit an endpoint)
- **Models** define data structure (what the data looks like)
- **Utils** handle cross-cutting concerns (email, validation, errors)

This made debugging significantly easier. When a user reported issues with email verification, I knew to check `userController.js` (the logic) and `mail.js` (the email sending). When the rotation didn't update on Monday, I checked `userRoutes.js` (the cron job definition).

### Key Architectural Decisions

**GridFS for Image Storage**: Initially considered AWS S3 or Cloudinary for restaurant logos and menu images, but went with MongoDB GridFS instead:
- **Why**: Keeps everything in one database (no third-party dependencies)
- **Tradeoff**: Slightly slower retrieval than CDN, but images are converted to base64 and sent inline
- **Learning**: GridFS streams are tricky - you can't just `await` a read operation, you have to handle `data` and `end` events manually
- **Real-world impact**: This simplified deployment (no AWS keys to manage) but added complexity in `restaurantController.js` where I stream images as base64

**JWT for Authentication**: Stateless authentication using JSON Web Tokens:
- **Why**: No need for session storage, tokens work seamlessly with mobile apps
- **Tradeoff**: Can't invalidate tokens server-side (they expire in 1 year)
- **Learning**: Had to be careful about what data goes in the token payload (only user ID, nothing sensitive)
- **Future improvement**: Would implement refresh tokens for better security

**node-cron for Weekly Rotation**: Scheduled task runs every Monday at midnight (`0 0 * * 1`):
- **Why**: Built-in solution, no external services like cron jobs or schedulers needed
- **Tradeoff**: If server restarts on Sunday night, cron job resets (but rotation still runs on schedule)
- **Learning**: Cron expressions are finicky
- **Real-world impact**: This automated the entire rotation system - no manual intervention needed

**Mongoose Pre-Save Hooks for Password Hashing**: Passwords automatically hash before saving:
- **Why**: Ensures passwords are *never* stored in plaintext, even if I forget to hash manually
- **Tradeoff**: Adds ~100ms to user registration, but security is worth it
- **Learning**: Had to use `isModified('password')` check to avoid re-hashing already hashed passwords on updates
- **Code location**: `userModel.js` lines 65-75

**TTL Indexes for Unverified Users**: Unverified users auto-delete after 60 seconds:
- **Why**: Prevents database bloat from users who register but never verify email
- **Tradeoff**: User has to re-register if they miss the 60 second window (strict, but encourages quick verification)
- **Learning**: MongoDB TTL indexes run every 60 seconds, so deletion isn't instant
- **Code location**: `userModel.js` lines 34-41

**Embedded Rotation Array in User Model**: User's weekly 10 restaurants stored directly in user document:
- **Why**: Faster reads - one query gets user + their restaurants (no joins)
- **Tradeoff**: Restaurant data duplicated across many users (not normalized)
- **Learning**: This is a classic denormalization trade-off
- **Real-world impact**: `getRotatedRestaurants` endpoint is blazing fast because it's one query

**Company Invitation System**: Users need a company invitation code to register:
- **Why**: Biz MuncH is B2B - companies buy subscriptions, employees get accounts
- **Tradeoff**: Can't have open public registration (intended for corporate use)
- **Learning**: Validation happens in `userController.js` before user creation
- **Real-world impact**: Prevents random users from signing up without company sponsorship

## Tech Stack & Why I Chose Each

### Runtime & Framework
**Node.js 18** with **Express 4.19**. Chose Node.js because:
- JavaScript everywhere (same language as React Native frontend and React dashboard)
- Non-blocking I/O for handling multiple API requests simultaneously
- Massive ecosystem (npm has everything I needed)

**Why Express?** Express is minimal but extensible:
- Middleware pattern makes adding CORS, JSON parsing, authentication incredibly clean
- Routing is intuitive (`app.use('/users', userRoutes)`)
- Mature ecosystem (most tutorials and Stack Overflow answers use Express)

### Database
**MongoDB 6.6** with **Mongoose 8.5**. Went with MongoDB because:
- **Flexible schema**: Restaurants have different menu structures - MongoDB doesn't force rigid schemas
- **Embedded documents**: User's rotation array is embedded in user document (fast reads)
- **GridFS**: Built-in file storage for images without needing AWS S3
- **JSON-native**: Data flows from MongoDB → Express → React Native as JSON (no ORM translation)

**Why Mongoose?** Mongoose adds structure to MongoDB:
- **Schema definitions**: Even though MongoDB is schemaless, Mongoose enforces structure (prevents bugs)
- **Validation**: Required fields, unique constraints, custom validators
- **Middleware**: Pre-save hooks for password hashing, post-delete hooks for cleanup
- **Population**: Relationships like `company` reference can be auto-populated

### Authentication & Security
**bcrypt** for password hashing:
- Industry standard for password hashing
- Uses salt rounds (10 in this project) to slow down brute-force attacks
- Mongoose pre-save hook ensures passwords always hash before storage

**jsonwebtoken (JWT)** for authentication tokens:
- Stateless auth (no server-side session storage)
- Mobile apps can store token in AsyncStorage and send with each request
- Token expires in 1 year (long-lived for mobile convenience)
- Payload contains only user ID (minimal data exposure)

**express-validator** for input validation:
- Validates email format, password length, required fields
- Sanitizes inputs with `.trim()` and `.escape()` to prevent XSS
- Validation errors caught before hitting database
- Used in all routes: `userRoutes.js`, `companyRoutes.js`, `restaurantRoutes.js`

### Email Service
**Nodemailer** with **Mailtrap**:
- **Nodemailer**: De facto standard for sending emails in Node.js
- **Mailtrap**: Email testing/delivery service (free tier for development, paid for production)
- **Why not SendGrid/Mailgun?** Mailtrap had simpler API and better free tier for testing
- **Use cases**: Email verification OTPs, password reset codes, welcome emails

**OTP System**: 7-digit codes generated with `generateOTP()`:
- Codes hash with bcrypt before storage (even OTPs are hashed)
- Stored in separate `VerificationToken` collection with expiration
- After verification, token is deleted (one-time use)

### Scheduled Tasks
**node-cron 3.0** for weekly rotation:
- **Why not external cron?** node-cron runs inside the Node process (simpler deployment)
- **Syntax**: `cron.schedule('0 0 * * 1', ...)` runs every Monday at midnight
- **Execution**: Fetches all users, calls `updateRotation()` for each
- **Performance**: For 1000 users, takes ~30 seconds (not a problem at midnight)

### Utilities
**CORS** for cross-origin requests:
- Mobile app and dashboard run on different domains than API
- `app.use(cors())` allows all origins (would restrict in production)

**dotenv** for environment variables:
- Stores sensitive config: `MONGO_URI`, `JWT_SECRET`, `MAILTRAP_TOKEN`
- `.env` file not committed to Git (security best practice)

**GridFS-stream** for image storage:
- MongoDB's file storage system for files > 16MB (though restaurant logos are usually < 500KB)
- Images split into chunks, stored across multiple documents
- Retrieved as streams, converted to base64 for API responses

## Project Structure

```
bizmunch_app_services/
├── controllers/
│   ├── companyController.js      # Company CRUD (create companies, validate invitations)
│   ├── menuController.js         # Menu operations (get menu, create menu with items)
│   ├── restaurantController.js   # Restaurant operations (get all restaurants with logos)
│   └── userController.js         # User operations (register, login, verify, rotation, favorites)
├── models/
│   ├── companyModel.js           # Company schema (name, invitationCode)
│   ├── menuModel.js              # Menu schema (nested category → items structure)
│   ├── restaurantModel.js        # Restaurant schema (name, location, category, logo, menuId)
│   ├── userModel.js              # User schema (auth, favorites, rotation array, TTL for unverified)
│   └── VerificationToken.js     # OTP token schema (owner, token, expiration)
├── routes/
│   ├── companyRoutes.js          # POST /company/register, GET /company/all
│   ├── restaurantRoutes.js       # GET /restaurant/allrestaurants, GET /restaurant/:id/menu
│   └── userRoutes.js             # POST /users/register, /auth, /verify-email, GET /rotated-restaurants
├── utils/
│   ├── errorHandlers.js          # Centralized error handling middleware
│   └── mail.js                   # Email templates and Nodemailer setup
├── .env                          # Environment variables (not in Git)
├── package.json                  # Dependencies and scripts
├── LICENSE                       # Project license
└── server.js                     # Express app entry point, MongoDB connection, GridFS setup
```

### Design Patterns I Used

**MVC Pattern**: Separation of concerns across models, controllers, and routes:
- **Models** (`models/`) define data schema with Mongoose
- **Controllers** (`controllers/`) contain business logic (registration, login, rotation)
- **Routes** (`routes/`) map HTTP methods + paths to controller functions
- **Why**: Clear separation makes codebase easy to navigate

**Middleware Chain Pattern**: Express middleware stack processes requests sequentially:
```javascript
app.use(cors());                    // 1. Allow cross-origin requests
app.use(express.json());            // 2. Parse JSON request bodies
app.use('/users', userRoutes);      // 3. Route to user endpoints
app.use(errorHandler);              // 4. Catch any errors
```
- Order matters
- Each middleware can modify `req` or `res` and pass to next

**Repository Pattern (implicit)**: Controllers interact with Mongoose models, not raw MongoDB:
- Controllers call `AppUser.findOne()`, `Restaurant.find()`, etc.
- Never write raw MongoDB queries like `db.collection('users').findOne()`
- **Why**: Mongoose handles connection pooling, validation, type casting

**Factory Pattern for Email Templates**: `mail.js` exports template generators:
- `generateEmailTemplate(code)` returns HTML string for verification emails
- `generatePasswordResetTemplate(url)` returns HTML for password reset
- **Why**: Keeps email HTML out of controller code, easy to update templates

**Scheduled Task Pattern**: Cron job defined in `userRoutes.js`:
```javascript
cron.schedule('0 0 * * 1', async () => {
    const users = await AppUser.find();
    users.forEach(user => updateRotation(user._id));
});
```
- Runs inside route file (executed when routes load)
- Calls controller function `updateRotation()`
- **Learning**: Initially put this in `server.js`, but routes are better (keeps related code together)

**Schema Hooks Pattern**: Mongoose pre/post hooks intercept model operations:
- **Pre-save hook** in `userModel.js`: Hashes password before saving
- **Pre-save hook**: Clears `expireAt` field when user verifies email
- **Why**: Ensures critical operations (hashing) never get forgotten

**Async/Await Error Handling**: Try-catch blocks in every controller function:
```javascript
const userRegister = async (req, res) => {
    try {
        // ... business logic
        res.status(201).json({ message: "Success" });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};
```
- Prevents unhandled promise rejections
- Always returns proper HTTP status codes
- **Future improvement**: Would use `express-async-handler` to reduce try-catch boilerplate

## API Endpoints

### Authentication Endpoints

**POST /users/register**
- **Body**: `{ firstName, lastName, email, password, company, invitation }`
- **Validation**: Email format, password min 8 chars, required fields
- **Process**: 
  1. Check if email already exists → 409 error
  2. Validate company invitation code → 404 if invalid
  3. Create user with 10 random restaurants in rotation array
  4. Generate OTP, hash it, store in VerificationToken collection
  5. Send verification email via Mailtrap
  6. Return user object (unverified, will auto-delete in 60 seconds if not verified)
- **Returns**: `{ message, user }`

**POST /users/verify-email**
- **Body**: `{ userId, otp }`
- **Process**:
  1. Find user by ID
  2. Find verification token for that user
  3. Compare submitted OTP with hashed token (bcrypt.compare)
  4. If match: Set `user.verified = true`, clear `expireAt` field, delete token
- **Returns**: `{ message: "Email verified successfully" }`

**POST /users/auth**
- **Body**: `{ email, password }`
- **Validation**: Email format, password min 8 chars
- **Process**:
  1. Find user by email → 400 if not found
  2. Compare password with hashed password (bcrypt.compare) → 400 if wrong
  3. Generate JWT with user ID, expires in 1 year
  4. Populate company data
  5. Return token + user info + pinned restaurants
- **Returns**: `{ message, token, user: { id, name, email, company }, pinnedRestaurants }`

**POST /users/forgot-password**
- **Body**: `{ email }`
- **Process**:
  1. Find user by email → 404 if not found
  2. Generate OTP, hash it, store in VerificationToken
  3. Send password reset email with OTP
- **Returns**: `{ message: "Password reset OTP sent" }`

**POST /users/verify-forgot-password**
- **Body**: `{ email, verificationCode, newPassword }`
- **Process**:
  1. Find user by email
  2. Find verification token, compare OTP
  3. If match: Update user password (pre-save hook hashes it), delete token
- **Returns**: `{ message: "Password reset successful" }`

**POST /users/update-password**
- **Body**: `{ userId, currentPassword, newPassword }`
- **Validation**: newPassword must be 8+ chars with 1 special char
- **Process**:
  1. Find user by ID
  2. Verify currentPassword matches (bcrypt.compare) → 403 if wrong
  3. Check newPassword ≠ currentPassword → 400 if same
  4. Update password (pre-save hook hashes it)
- **Returns**: `{ error: false, message: "Password updated successfully" }`

### Restaurant Endpoints

**GET /restaurant/allrestaurants**
- **Process**:
  1. Fetch all restaurants (only name, category, logo, location fields)
  2. For each restaurant, stream logo from GridFS, convert to base64
  3. Return array of restaurants with inline base64 images
- **Returns**: `[{ _id, name, category, location, logo: "data:image/png;base64,..." }, ...]`
- **Performance**: Streaming 50 logos takes ~2-3 seconds

**GET /restaurant/:id/menu**
- **Params**: `:id` = restaurant ID
- **Process**:
  1. Find restaurant by ID, populate menuId
  2. Return full menu structure (categories → items with name, price, calories, description, image)
- **Returns**: `{ _id, restaurantName, menu: { Appetizers: [...], Entrees: [...], ... } }`

**POST /restaurant/createmenu**
- **Body**: `{ restaurantId, menu: { category: [items] } }`
- **Process**:
  1. Create new Menu document with nested structure
  2. Update restaurant's menuId reference
- **Returns**: `{ message: "Menu created successfully", menu }`

### User-Specific Endpoints

**GET /users/rotated-restaurants/:userId**
- **Params**: `:userId` = user ID
- **Process**:
  1. Find user by ID, populate rotation array (gets full restaurant objects)
  2. For each restaurant in rotation, stream logo from GridFS, convert to base64
  3. Return rotation array with inline images
- **Returns**: `[{ _id, name, category, location, logo: "data:image/png;base64,..." }, ...]`
- **Mobile app uses this**: Home screen calls this endpoint to display weekly 10 restaurants

**POST /users/update-favorites**
- **Body**: `{ userId, restaurantIds: [id1, id2] }` (max 2 IDs)
- **Process**:
  1. Find user by ID
  2. Replace user.favorites array with new restaurantIds
  3. Save user
- **Returns**: `{ message: "Favorites updated successfully", favorites: [...] }`
- **Mobile app uses this**: When user pins/unpins restaurants

**GET /users/get-pinned-restaurants/:userId**
- **Params**: `:userId` = user ID
- **Process**: Find user, return favorites array
- **Returns**: `[restaurantId1, restaurantId2]` (just IDs, not full objects)

### Company Endpoints (Admin Dashboard)

**POST /company/register**
- **Body**: `{ name, invitationCode }`
- **Process**: Create new company with unique invitation code
- **Returns**: `{ message, company }`

**GET /company/all**
- **Process**: Fetch all companies
- **Returns**: `[{ _id, name, invitationCode }, ...]`

## How the Weekly Rotation Works

This is the core feature of Biz MuncH, and the logic was the most complex part to get right.

### Cron Job Definition (userRoutes.js:46-53)

```javascript
cron.schedule('0 0 * * 1', async () => {
    console.log('Running weekly rotation update');
    const users = await AppUser.find();
    users.forEach(user => updateRotation(user._id));
    console.log('Weekly rotation update done');
});
```

- **Schedule**: `'0 0 * * 1'` = minute 0, hour 0 (midnight), any day of month, any month, Monday (1)
- **Execution**: Runs every Monday at 00:00:00
- **Process**: Fetches all users, calls `updateRotation()` for each user ID

### Rotation Algorithm (userController.js:264-307)

The `updateRotation()` function is where the magic happens:

1. **Fetch user + all restaurants**:
```javascript
const user = await AppUser.findById(userId);
const allRestaurants = await Restaurant.find();
```

2. **Lock in pinned restaurants** (if user has favorites):
```javascript
const selectedFavorites = user.favorites.map(favorite => {
    const restaurant = allRestaurants.find(rest => rest._id.equals(favorite));
    return {
        restaurantId: restaurant._id,
        name: restaurant.name,
        category: restaurant.category,
        location: restaurant.location,
        logo: restaurant.logo,
    };
});
```
- User's pinned restaurants (max 2) become the first slots in new rotation
- Restaurant data is embedded (not just IDs) for fast reads

3. **Fill remaining slots with random restaurants**:
```javascript
const remainingRestaurants = allRestaurants.filter(rest => !user.favorites.includes(rest._id));
const shuffledRestaurants = remainingRestaurants.sort(() => 0.5 - Math.random());
const remainingSlots = 10 - selectedFavorites.length;
const selectedRestaurants = shuffledRestaurants.slice(0, remainingSlots);
```
- Exclude pinned restaurants from random pool
- Shuffle using `sort(() => 0.5 - Math.random())` (not cryptographically random, but sufficient)
- Take enough restaurants to fill 10 total slots

4. **Update user's rotation array**:
```javascript
user.rotation = [...selectedFavorites, ...selectedRestaurants];
await user.save();
```
- Pinned restaurants appear first (UX decision - user sees favorites at top)
- Total of 10 restaurants always

### Example Scenarios

**Scenario 1: User pins 2 restaurants**
- Monday 12:01 AM: Rotation runs
- User has `favorites: [restaurant_A, restaurant_B]`
- New rotation: `[restaurant_A, restaurant_B, random_1, random_2, ..., random_8]` (10 total)

**Scenario 2: User pins 0 restaurants**
- Monday 12:01 AM: Rotation runs
- User has `favorites: []`
- New rotation: `[random_1, random_2, ..., random_10]` (10 total)

**Scenario 3: User pins 1 restaurant**
- Monday 12:01 AM: Rotation runs
- User has `favorites: [restaurant_A]`
- New rotation: `[restaurant_A, random_1, random_2, ..., random_9]` (10 total)

**Scenario 4: Restaurant appears multiple weeks**
- Week 1: User gets restaurant_A (randomly selected)
- Week 2: User could get restaurant_A again (no history tracking)
- **Why**: Rotation is purely random each week
- **Future improvement**: Could add "seen in last 4 weeks" filter

## What I Learned

### Backend Development Fundamentals

**REST API Design**: This was my first time building a production API. Learned:
- **Resource naming**: `/users`, `/restaurant`, `/company` (plural for collections, singular for single resource)
- **HTTP verbs**: GET for reads, POST for writes (didn't use PUT/PATCH/DELETE to keep it simple)
- **Status codes**: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict, 500 Internal Server Error
- **Error responses**: Always return `{ message: "..." }` or `{ error: "..." }` (consistent structure)

**Authentication Flow**: Understanding how mobile auth works:
- User registers → receives OTP via email → verifies → gets JWT token
- Mobile app stores token in AsyncStorage
- Every API request includes token in Authorization header (future: not implemented yet, but should be)
- Token expires in 1 year (long-lived for mobile convenience)

**Database Design for Non-Relational Data**: MongoDB is not SQL:
- **Denormalization is OK**: User's rotation array embeds restaurant data (duplicated across users)
- **Tradeoff**: Faster reads (no joins) vs. more storage + potential data staleness
- **When to embed vs. reference**: Embed data that's read together (rotation + restaurant), reference data that changes often (user → company)
- **ObjectId vs. String**: Mongoose auto-converts string IDs to ObjectId, but I learned to use `mongoose.Types.ObjectId()` for manual conversions

**Asynchronous JavaScript Mastery**: Everything in Node.js is async:
- Database queries return Promises → must `await`
- Stream reading (GridFS) uses event emitters (`on('data')`, `on('end')`)
- Learned to use `Promise.all()` for parallel operations (fetch multiple restaurant logos)
- Error handling with try-catch blocks around every async function

### Express.js Specifics

**Middleware Order Matters**: CORS must come before routes, error handler must come last:
```javascript
app.use(cors());           // Must be first
app.use(express.json());   // Before routes
app.use('/users', userRoutes);
app.use(errorHandler);     // Must be last
```
- Initially put CORS after routes → got CORS errors
- Fixed by moving CORS to top

**Route Organization**: Breaking routes into separate files:
- `server.js` imports and mounts route files: `app.use('/users', userRoutes)`
- Each route file defines endpoints: `router.post('/register', userRegister)`
- Final URL: `POST /users/register`
- **Learning**: Keep related routes together (all user operations in `userRoutes.js`)

**Request/Response Cycle**: Understanding `req` and `res`:
- `req.body` = JSON payload (parsed by `express.json()`)
- `req.params` = URL parameters (`/users/:userId` → `req.params.userId`)
- `req.query` = Query strings (`/users?name=John` → `req.query.name`)
- `res.status(200).json({ ... })` = Send JSON response with status code

**Validation with express-validator**: Middleware validates before controller runs:
```javascript
router.post('/register', [
    body('email').isEmail(),
    body('password').isLength({ min: 8 })
], userRegister);
```
- Validation errors caught in controller: `const errors = validationResult(req)`
- **Learning**: Validation prevents bad data from reaching database

### MongoDB & Mongoose

**Schema Design**: Defining structure in Mongoose schemas:
- **Types**: String, Number, Boolean, Date, ObjectId, Array, Embedded objects
- **Validation**: `required: true`, `unique: true`, `minlength`, `maxlength`
- **Defaults**: `default: false`, `default: Date.now`
- **References**: `type: mongoose.Schema.Types.ObjectId, ref: 'Company'`

**Mongoose Hooks (Middleware)**: Pre-save hooks run before saving:
```javascript
appUserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});
```
- `this` refers to the document being saved
- `isModified('password')` checks if password field changed (avoids re-hashing)
- Must call `next()` to continue save operation
- **Learning**: Hooks are perfect for automatic operations (hashing, timestamps, validation)

**Population**: Resolving references:
```javascript
const user = await AppUser.findOne({ email }).populate('company');
```
- Without populate: `user.company` is just an ObjectId
- With populate: `user.company` is full company object `{ _id, name, invitationCode }`
- **Learning**: Populate adds extra query, so only use when needed

**TTL Indexes**: Auto-delete documents after expiration:
```javascript
expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 60000),  // 60 seconds from now
    index: { expires: '1m' },
    sparse: true
}
```
- MongoDB background process checks TTL indexes every 60 seconds
- Documents with `expireAt < now` get deleted automatically
- `sparse: true` = only documents with `expireAt` field are indexed
- **Use case**: Unverified users auto-delete after 1 minute

**GridFS Streams**: Reading files from GridFS:
```javascript
const readStream = gfs.openDownloadStream(fileId);
const chunks = [];
readStream.on('data', chunk => chunks.push(chunk));
const buffer = await new Promise((resolve, reject) => {
    readStream.on('end', () => resolve(Buffer.concat(chunks)));
    readStream.on('error', reject);
});
const base64 = buffer.toString('base64');
```
- GridFS doesn't return Promises → must use event emitters
- `data` event fires for each chunk → collect in array
- `end` event fires when done → concatenate chunks, convert to base64
- **Learning**: Streams are more memory-efficient for large files, but more complex than `readFile()`

### Security Best Practices

**Password Hashing with bcrypt**: Never store plaintext passwords:
- Hash with salt rounds (10 = 2^10 iterations = ~100ms)
- Higher rounds = slower but more secure (protects against brute-force)
- Comparison: `bcrypt.compare(plaintext, hash)` (never decrypt hash)

**JWT Token Design**: What to include in token payload:
- **Include**: User ID (minimal, non-sensitive)
- **Don't include**: Password, email, personal info (JWT is not encrypted, just signed)
- **Expiration**: 1 year for mobile convenience (tradeoff: long-lived tokens are riskier)
- **Future improvement**: Refresh tokens + short-lived access tokens (more secure)

**Input Validation**: Never trust client input:
- Validate email format, password length, required fields
- Sanitize inputs: `.trim()` removes whitespace, `.escape()` prevents XSS
- Mongoose schema validation is second layer (express-validator is first)

**Environment Variables**: Never commit secrets to Git:
- `MONGO_URI`, `JWT_SECRET`, `MAILTRAP_TOKEN` stored in `.env`
- `.gitignore` includes `.env` (never committed)

### Node-cron & Scheduled Tasks

**Cron Expression Syntax**: `minute hour dayOfMonth month dayOfWeek`
- `0 0 * * 1` = minute 0, hour 0, any day, any month, Monday
- `0 0 * * *` = every day at midnight
- `0 12 * * 1-5` = noon on weekdays
- **Learning**: Day of week starts at 0 (Sunday) or 1 (Monday) depending on library

**Cron Job Best Practices**:
- **Logging**: Always log when cron job starts/ends (`console.log('Running weekly rotation')`)
- **Error handling**: Wrap cron logic in try-catch (don't let one user error stop entire rotation)
- **Testing**: Can't easily test cron timing → extract logic into function (`updateRotation()`) and test that

### Email & Nodemailer

**Email Templates**: HTML emails with inline CSS:
- No external stylesheets (email clients block them)
- Inline styles: `<div style="color: #272727;">...</div>`
- Responsive design with media queries: `@media only screen and (max-width: 620px)`
- **Learning**: Email HTML is like web development from 2005 (tables, inline styles, limited CSS)

**Transactional Email Services**: Mailtrap vs. SendGrid vs. Mailgun:
- **Development**: Mailtrap catches emails (doesn't actually send) - perfect for testing
- **Production**: Mailtrap has delivery option, but SendGrid/Mailgun have better deliverability
- **API**: Nodemailer abstracts the service (can swap Mailtrap for SendGrid without code changes)

**OTP Generation & Verification**:
- Random 7-digit code: `Math.round(Math.random() * 9)` repeated 7 times
- Hash OTP before storage (even temporary codes should be hashed)
- One-time use: Delete token after verification
- Expiration: VerificationToken has TTL index (expires after 5 minutes)

### Challenges Overcome

**GridFS Stream Handling**: Getting images out of GridFS was painful:
- GridFS returns streams, not buffers → can't just `await gfs.read()`
- Had to manually handle `data` and `end` events
- Wrap stream in Promise to use async/await
- **Solution**: Created reusable pattern in `restaurantController.js` and `userController.js` (lines 322-346)

**Cron Job Timezone Issues**: Initially, rotation ran at wrong time:
- Server was in UTC timezone, but wanted rotation at midnight local time
- **Solution**: Used `0 0 * * 1` which runs at midnight server time
- **Future improvement**: Use timezone-aware cron library

**Denormalized Data Staleness**: Restaurant data embedded in user's rotation:
- If restaurant name changes in `Restaurant` collection, user's rotation still has old name
- **Tradeoff**: Accepted staleness for read speed (rotation only updates once a week anyway)
- **Future improvement**: Could use MongoDB change streams to auto-update embedded data

**Unverified User Cleanup**: Users who register but never verify:
- Initially, unverified users lingered in database forever
- **Solution**: TTL index auto-deletes after 60 seconds (lines 34-41 in `userModel.js`)
- **Learning**: MongoDB TTL indexes are perfect for temporary data

**Password Update Security**: User changing password:
- Needed to verify current password before allowing update
- Needed to prevent setting new password = current password
- Needed to ensure new password meets complexity requirements
- **Solution**: Multi-step validation in `updateUserPassword()` (lines 219-240)

**Rotation Algorithm Edge Cases**:
- What if user has 0 pinned restaurants? → Fill all 10 slots with random
- What if user has 2 pinned restaurants? → Fill 8 slots with random
- What if restaurant database has < 10 restaurants? → Would crash (need validation)
- **Solution**: Dynamic slot calculation: `remainingSlots = 10 - selectedFavorites.length`

### If I Built This Again

**Add Authentication Middleware**: Currently, endpoints don't verify JWT:
- Mobile app sends token in Authorization header, but API doesn't check it
- **Why**: Focused on getting core features working first (authentication, rotation, CRUD)
- **Future**: Add Express middleware to verify JWT on protected routes

**Use TypeScript**: JavaScript lacks type safety:
- Had bugs where I passed `restaurantId` as string instead of ObjectId
- TypeScript would catch these at compile time
- **Why didn't I**: Wanted to learn Node.js fundamentals first, TypeScript adds complexity

**Implement Refresh Tokens**: 1-year JWT tokens are insecure:
- If token leaks, attacker has access for entire year
- **Better approach**: Short-lived access tokens (15 mins) + long-lived refresh tokens (30 days)
- When access token expires, use refresh token to get new access token

**Use Docker for Development**: Currently, need MongoDB installed locally:
- Docker would containerize MongoDB, make setup easier for other developers
- `docker-compose up` starts entire stack (API + MongoDB)

**Add Request Logging**: No logs for incoming requests:
- Would use Morgan middleware to log all requests (`GET /users/rotated-restaurants/:userId 200 45ms`)
- Helpful for debugging and monitoring

**Error Handling Middleware**: Currently, try-catch in every controller:
- Lots of boilerplate: `try { ... } catch (error) { res.status(500).json(...) }`
- **Better**: Use `express-async-handler` or custom error middleware
- Controllers throw errors, middleware catches and formats response

**Database Indexing**: No indexes on frequently queried fields:
- Would add index on `email` field (currently only `unique: true` creates index)
- Would add index on `rotation.restaurantId` for faster lookups
- **Learning**: Indexes speed up reads but slow down writes (tradeoff)

**Testing**: No tests currently:
- Would use Jest + Supertest for API endpoint tests
- Would mock MongoDB with `mongodb-memory-server`
- Would test edge cases (invalid email, wrong password, expired OTP)

**API Documentation**: No documentation for endpoints:
- Would use Swagger/OpenAPI to auto-generate API docs
- Mobile app developers could see available endpoints + request/response shapes
- Alternative: Postman collection with example requests

**Rate Limiting**: No protection against spam:
- Attacker could spam `/users/register` to flood database
- **Solution**: Use `express-rate-limit` to cap requests per IP (e.g., 100 requests/15 minutes)

**CORS Configuration**: Currently allows all origins:
- `app.use(cors())` allows any domain to call API
- **Production**: Restrict to known domains: `cors({ origin: ['https://app.bizmunch.com', 'https://dashboard.bizmunch.com'] })`

**Database Connection Retry Logic**: If MongoDB goes down, app crashes:
- Currently, connection failure logs error but doesn't retry
- **Better**: Retry connection every 5 seconds until successful

**Separation of Concerns**: Cron job in `userRoutes.js`:
- Route files should only define routes, not scheduled tasks
- **Better**: Move cron job to separate `scheduler.js` file, import in `server.js`

## Getting Started

### Prerequisites
- **Node.js 18+** and npm
- **MongoDB 6.6+** (local installation or MongoDB Atlas cloud)
- **Mailtrap account** (free tier for email testing)

### Environment Variables

Create a `.env` file in the root:

```
# MongoDB connection string
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/

# Database name
DB_NAME=bizmunch

# JWT secret for signing tokens (generate with: openssl rand -base64 32)
JWT_SECRET=your_secret_jwt_key_here

# Mailtrap API token (get from Mailtrap dashboard)
MAILTRAP_TOKEN=your_mailtrap_token_here

# Server port (optional, defaults to 5000)
PORT=5000
```

### Installation

```bash
# Install dependencies
npm install

# Start server
npm start
```

Server starts on `http://localhost:5000` (or whatever PORT you set).

### MongoDB Setup

**Option 1: Local MongoDB**
```bash
# Install MongoDB Community Edition
# macOS: brew install mongodb-community
# Windows: Download installer from mongodb.com

# Start MongoDB service
# macOS: brew services start mongodb-community
# Windows: Run MongoDB as Windows service

# Set MONGO_URI in .env:
MONGO_URI=mongodb://localhost:27017/
```

**Option 2: MongoDB Atlas (Cloud)**
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create free cluster (M0 tier)
3. Whitelist your IP address
4. Create database user
5. Get connection string, set as MONGO_URI in `.env`

### Testing Endpoints

**Using cURL**:
```bash
# Register a user (after creating a company with invitation code)
curl -X POST http://localhost:5000/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "password123",
    "company": "company_id_here",
    "invitation": "COMPANY_CODE"
  }'

# Login
curl -X POST http://localhost:5000/users/auth \
  -H "Content-Type: application/json" \
  -d '{ "email": "john@example.com", "password": "password123" }'

# Get rotated restaurants
curl http://localhost:5000/users/rotated-restaurants/user_id_here
```

**Using Postman**:
1. Import requests as new collection
2. Set base URL: `http://localhost:5000`
3. Test endpoints with JSON body
4. Save token from `/auth` response for authenticated requests (future)

### Project Scripts

```bash
# Start server (production)
npm start

# Start server with nodemon (development, auto-restarts on file changes)
npm run dev    # Note: Need to add this script to package.json

# Test cron job manually (runs rotation for all users)
# Currently no script
```

## MongoDB Collections

The database contains 5 main collections:

### appusers (User accounts)
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
  expireAt: Date (TTL index, auto-deletes after 60 seconds if not verified),
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
      {
        name: String,
        price: Number,
        description: String,
        calories: Number,
        image: String (GridFS file ID or URL)
      }
    ],
    Entrees: [...],
    Desserts: [...]
    // ... more categories
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

### verificationtokens (OTP tokens)
```javascript
{
  _id: ObjectId,
  owner: ObjectId (ref: AppUser),
  token: String (bcrypt hashed OTP),
  createdAt: Date (TTL index, expires after 5 minutes)
}
```

### uploads.files & uploads.chunks (GridFS collections)
GridFS automatically creates these for image storage:
- `uploads.files`: Metadata (filename, uploadDate, length, contentType)
- `uploads.chunks`: Binary data split into 255KB chunks

## Deployment

This backend can be deployed to any Node.js hosting platform:

## API Response Format

All endpoints follow consistent response format:

**Success Response**:
```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response**:
```json
{
  "error": "Error message describing what went wrong"
}
```
or
```json
{
  "message": "Error message"
}
```

**HTTP Status Codes**:
- `200 OK`: Successful GET request
- `201 Created`: Successful POST (resource created)
- `400 Bad Request`: Invalid input (validation failed)
- `401 Unauthorized`: Not logged in (future: when auth middleware added)
- `403 Forbidden`: Wrong password or insufficient permissions
- `404 Not Found`: Resource doesn't exist (user, restaurant, token)
- `409 Conflict`: Resource already exists (duplicate email)
- `500 Internal Server Error`: Something went wrong on server

## License

This project is part of my portfolio. Feel free to look around, but please don't copy it wholesale for your own portfolio.
