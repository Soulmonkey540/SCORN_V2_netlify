// netlify/functions/admin-logout.js
const { cookieDeLogout } = require('../../lib/auth');

exports.handler = async function () {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieDeLogout(),
        },
        body: JSON.stringify({ ok: true }),
    };
};
