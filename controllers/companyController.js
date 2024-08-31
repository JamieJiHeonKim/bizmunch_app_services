const mongoose = require('mongoose');
const Company = require('../models/companyModel');

const getCompanyNames = async (req, res) => {
    try {
        const companies = await Company.find({}, 'name');
        res.status(200).json({ companies });
    } catch (error) {
        // console.error('Error fetching company names:', error);
        res.status(500).json({ message: 'Internal server error while fetching company names.' });
    }
};

const validateInvitationCode = async (req, res) => {
    const { invitationCode } = req.params;
    try {
        const foundCompany = await Company.findOne({ invitationCode, status: 'active' });
        if (foundCompany) {
            res.status(200).json({
                message: 'Success: Invitation Code found.',
                valid: true,
                name: foundCompany.name,
                domain: foundCompany.domain,
                location: foundCompany.location
            });
        } else {
            res.status(404).json({ valid: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getCompanyNames,
    validateInvitationCode
};