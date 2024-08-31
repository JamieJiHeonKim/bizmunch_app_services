const sendErrorResponse = (res, statusCode, message) => {
    // console.error(message);
    res.status(statusCode).json({
        message
    });
};