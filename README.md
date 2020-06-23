# Xsite® MANAGE Partner SDK
Example code showing how Manage external access can be used.

## Prerequisites:
- Node 12 installed
- Latest Chrome
- Run `npm install`
- The following information about Xsite® MANAGE:
    - CLIENT_ID: Oauth2 client id assigned by Xsite® MANAGE to a client using the third party api
    - CLIENT_SECRET: Secret string associated with the client
    - AUTH_DOMAIN: Dns domain of Xsite® MANAGE authentication service
    - MANAGE_API_URL: Xsite® MANAGE third party api url
- Create file `.env` using `.env.sample` as a template. Replace example values
  with Xsite® MANAGE information listed above.

## Usage:
1. Run `npm start`
2. Open `http://localhost:3000` (or different port, if so defined in `.env`)
3. Complete Xsite® MANAGE login flow
4. Observe refresh and id tokens returned in client stdout
