const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    domain: { type: String, required: false, unique: false },
    location: { type: String, required: true },
    invitationCode: { type: String, required: true, unique: true },
    managerName: { type: String, required: true },
    managerEmail: { type: String, required: true, unique: true },
    numberOfEmployees: { type: Number, required: true },
    billingCycle: { type: Date, required: true },
    monthlyCost: { type: Number, required: true },
    status: { type: String, required: true, default: 'active' }
  }, { timestamps: true });

const companydb = mongoose.model('Company', companySchema);
module.exports = companydb;