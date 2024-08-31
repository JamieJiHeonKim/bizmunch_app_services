const express = require('express');
const router = express.Router();
const { getCompanyNames, validateInvitationCode } = require('../controllers/companyController');

router.get('/companies', getCompanyNames);
router.get('/validate-invitation-code/:invitationCode', validateInvitationCode);

module.exports = router;
