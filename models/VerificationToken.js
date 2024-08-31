const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const VerificationTokenSchema = new mongoose.Schema({
    owner : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        expires: 300,
        default: Date.now()
    }
});

VerificationTokenSchema.pre('save', async function (next) {
    if (this.isModified('token')) {
        if (!this.token.startsWith('$2b$')) {
            this.token = await bcrypt.hash(this.token, 10);
        }
    }
    next();
});

VerificationTokenSchema.methods.compareToken = async function (token) {
    return bcrypt.compare(token, this.token);
};

const verificationTokendb = new mongoose.model('VerificationToken', VerificationTokenSchema);

module.exports = verificationTokendb;