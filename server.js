const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;
const GridFSBucket = require('mongodb').GridFSBucket;
const Grid = require('gridfs-stream');
const userRoutes = require('./routes/userRoutes');
const companyRoutes = require('./routes/companyRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

require('dotenv').config();

app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);
app.use('/company', companyRoutes);
app.use('/restaurant', restaurantRoutes);

mongoose.set('strictQuery', false);
console.log("Attempting to connect to MongoDB...");
mongoose.connect(process.env.MONGO_URI, 
    {
        ssl: true,
        dbName: process.env.DB_NAME,
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    }
);

const conn = mongoose.connection;
let gfs;

conn.once('open', () => {
    console.log('MongoDB connection is open.');
    const db = conn.db;
    gfs = new GridFSBucket(db, {
        bucketName: 'uploads'
    });
    app.locals.gfs = gfs;

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});

conn.on('error', (error) => {
    console.log('MongoDB connection error:', error);
});