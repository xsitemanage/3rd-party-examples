const fastify = require("fastify")()
const axios = require("axios").default
const { stringify } = require("querystring")
require("dotenv").config()

const PORT = process.env.PORT
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
const AUTH_DOMAIN = process.env.AUTH_DOMAIN
const MANAGE_API_URL = process.env.MANAGE_API_URL
// CSRF token should not be static in production use
const CSRF_STATE = "REPLACE_WITH_CROSS_SITE_REQUEST_FORGERY_TOKEN"

// Received id token
let idToken

/**
 * Base64 encode client id and secret for basic authentication
 */
function getBasicAuthorizationEncoded() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
}
/**
 * Exchange authorization code for refresh token
 * @param {string} code Authorization code received using callback
 * @returns {string} Refresh token
 */
const getRefreshToken = async (code) => {
  const data = {
    grant_type: "authorization_code",
    code: code,
    redirect_uri: REDIRECT_URI,
  }
  try {
    const result = await axios.post(
      `https://${AUTH_DOMAIN}/oauth2/token`,
      stringify(data),
      {
        headers: {
          Authorization: `Basic ${getBasicAuthorizationEncoded()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )
    return result.data.refresh_token
  } catch (err) {
    console.log(
      `HTTP(S) error: '${err.message}'. Http status: '${
        err.response.status
      }'. Data: '${JSON.stringify(err.response.data)}'`
    )
    throw new Error("Error while fetching tokens")
  }
}

/**
 * Exchange refresh token for id token
 * @param {string} code Authorization code received using callback
 * @returns {string} Refresh token
 */
const getIdToken = async (refreshToken) => {
  const data = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }
  try {
    const result = await axios.post(
      `https://${AUTH_DOMAIN}/oauth2/token`,
      stringify(data),
      {
        headers: {
          Authorization: `Basic ${getBasicAuthorizationEncoded()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )
    return result.data.id_token
  } catch (err) {
    console.log(
      `HTTP(S) error: '${err.message}'. Http status: '${
        err.response.status
      }'. Data: '${JSON.stringify(err.response.data)}'`
    )
    throw new Error("Error while fetching tokens")
  }
}

// 1. Forward requests to authentication UI
fastify.get("/", async (request, reply) => {
  reply.type("text/html")
  return `<html>
    <head>
      <script>
        window.location.replace('https://${AUTH_DOMAIN}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${CSRF_STATE}')
      </script>
    </head>
  </html>`
})

// 2. Process callback from authentication UI in order to get refresh token. Redirects to success URL
fastify.get("/callback", async (request, reply) => {
  console.log("got callback", request.raw.url)
  const code = request.query.code
  const state = request.query.state
  if (state !== CSRF_STATE) throw new Error("CSRF token mismatch")
  // Store refresh token in a safe place for future use
  const refreshToken = await getRefreshToken(code)
  console.log("Refresh token: ", refreshToken)
  // Later refresh token can be used to get a short lived id token
  idToken = await getIdToken(refreshToken)
  console.log("Id token: ", idToken)
  reply.redirect("/success")
})

// 3. Notify user that authorization was successful
// 4. Do an example Manage api call with received token
fastify.get("/success", async (request, reply) => {
  const callUrl = `https://${MANAGE_API_URL}/site/sites?foo=bar`
  let response

  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: (status) => true,
    }
    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  reply.type("text/html")
  return `
    <html><body>
      <h1>Log</h1>
      <h2>Authentication</h2>
      Authentication successful
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
    </body></html>`
})

// Start local server
const start = async () => {
  try {
    console.log(`Starting http://localhost:${PORT}`)
    await fastify.listen(PORT)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
