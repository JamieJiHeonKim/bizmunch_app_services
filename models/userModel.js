const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const appUserSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    company: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Company' 
    },
    invitation: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    verified: {
        type: Boolean,
        default: false,
    },
    expireAt: {
        type: Date,
        default: function() {
            return !this.verified ? new Date(Date.now() + 60000) : undefined;
        },
        index: { expires: '1m' },
        sparse: true
    },
    favorites: [
        {
            type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant'
        }
    ],
    rotation: [
        {
            restaurantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Restaurant'
            },
            name: { type: String, required: true },
            location: { type: String, required: true },
            managerName: { type: String },
            managerEmail: { type: String },
            category: { type: String, required: true },
            logo: { type: String },
            // barcode: { type: String, required: true },
            menuId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' }
        }
    ]
});

appUserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }

    if (this.verified) {
        this.expireAt = undefined;
    }

    next();
});

appUserSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

const userdb = mongoose.model('AppUser', appUserSchema);
module.exports = userdb;