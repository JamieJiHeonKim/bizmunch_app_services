const nodemailer = require('nodemailer');

const generateOTP = () => {
    let otp = '';
    for(let i=0; i <=6; i++) {
        const randVal = Math.round(Math.random() * 9);
        otp = otp + randVal;
    }
    return otp;
}

const mailTransport = () => 
    console.log("process.env.MAILTRAP_PROD_USERNAME:", process.env.MAILTRAP_PROD_USERNAME);
    console.log("process.env.MAILTRAP_PROD_PASSWORD:", process.env.MAILTRAP_PROD_PASSWORD);
    nodemailer.createTransport({
        host: "live.smtp.mailtrap.io",
        port: 587,
        auth: {
            user: process.env.MAILTRAP_PROD_USERNAME,
            pass: process.env.MAILTRAP_PROD_PASSWORD
        }
    }
);

const generateEmailTemplate = (code, url) => {
    return(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <style>
            @media only screen and (max-width: 620px){
                h1{
                    font-size: 20px;
                    padding: 5px;
                }
            }
            </style>
        </head>
        <body>
        <div>
            <div style="max-width: 620px; margin: 0 auto; font-famil: sans-serif; color: #272727;">
                <h1 style="background: #f6f6f6; padding: 10px; text-align: center; color: #272727;">
                    Hi from Biz MuncH!
                </h1>
                <p style="text-align: center;">
                    Please verify your email with verification code:  
                </p>
                <p style="width: 80px; margin: 0 auto; font-weight: bold; text-align: center; background: #f6f6f6; border-radius: 5px; font-size: 25px;">
                    ${code}
                </p>
                <p style="font-weight: bold; text-align: center;">
                    Your verification code will expire in 1 minute  
                </p>
            </div>
        </div>
        `
    )
}

const plainEmailTemplate = (heading, message) => {
    return(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <style>
                @media only screen and (max-width: 620px){
                    h1{
                        font-size: 20px;
                        padding: 5px;
                    }
                }
            </style>
        </head>
        <body>
            <div>
                <div style="max-width: 620px; margin: 0 auto; font-family: sans-serif; color: #272727;">
                    <h1 style="background: #f6f6f6; padding: 10x; text-align: center; color: #272727;">
                        ${heading}
                    </h1>
                    <p style="color: #272727; text-align: center;" >
                        ${message}
                    </p>
                </div>
            </div>
        </body>
        </html>
        `
    )
}

const generatePasswordResetTemplate = (url) => {
    return(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <style>
                @media only screen and (max-width: 620px){
                    h1{
                        font-size: 20px;
                        padding: 5px;
                    }
                }
            </style>
        </head>
        <body>
            <div>
                <div style="max-width: 620px; margin: 0 auto; font-family: sans-serif; color: #272727;">
                    <h1 style="background: #f6f6f6; padding: 10px; text-align: center; color: #272727;">
                        Biz MuncH: Password Reset
                    </h1>
                    <p style="color: #272727; text-align: center;">
                        Please find the link below to reset your password
                    </p>
                    <div style="text-align: center;">
                        <a href="${url}" style="font-family: sans-serif; margin: 0 auto; padding: 20px; text-align: center; background: #e63946; border-radius: 5px; font-size: 20px 10px; color: #fff; cursor: pointer; text-decoration: none; display: inline-block;">
                            Reset Password
                        </a>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `
    )
}

const newPasswordEmailTemplate = (heading, message, url) => {
    return(
        `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <style>
                @media only screen and (max-width: 620px){
                    h1{
                        font-size: 20px;
                        padding: 5px;
                    }
                }
            </style>
        </head>
        <body>
            <div>
                <div style="max-width: 620px; margin: 0 auto; font-family: sans-serif; color: #272727;">
                    <h1 style="background: #f6f6f6; padding: 10x; text-align: center; color: #272727;">
                        ${heading}
                    </h1>
                    <p style="color: #272727; text-align: center;" >
                        ${message}
                    </p>
                    <div style="text-align: center;">
                        <a href="${url}" style="font-family: sans-serif; margin: 0 auto; padding: 20px; text-align: center; background: #24a0ed; border-radius: 5px; font-size: 20px 10px; color: #fff; cursor: pointer; text-decoration: none; display: inline-block;">
                            Go to Login
                        </a>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `
    )
}

module.exports = {
    generateOTP,
    mailTransport,
    generateEmailTemplate,
    plainEmailTemplate,
    generatePasswordResetTemplate,
    newPasswordEmailTemplate
}