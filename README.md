# Xsite® MANAGE Partner SDK

Example code showing how Manage external access can be used.

## Prerequisites:

- Node 12 installed
- Latest Chrome
- Run `npm install`
- The following information about Xsite® MANAGE:
  - CLIENT_ID: OAuth2 client id assigned by Xsite® MANAGE to a client using the third-party API
  - CLIENT_SECRET: Secret string associated with the client
- Create file `.env` using `.env.sample` as a template. Replace example values
  with Xsite® MANAGE information listed above.

## Usage:

1. Run `npm start`
2. Open `http://localhost:3000/api` (or a different port, if so defined in `.env`)
3. Complete Xsite® MANAGE login flow
4. Observe refresh and id tokens returned in client stdout

## API Usage

### Common parameters

For OAuth2-based, authorization, please see the example code. CORS support is not available at the moment.

### Common errors

- 400 Bad request. Some request parameter is invalid
- 401 Unauthorized. Token valid, but no access to the requested resource
- 403 Forbidden. The token is probably not valid

Application error response body: [Response schema](schema/common-error-body.json).

Please note that systems between the application and the client also produce error responses of different formats.

### Paging

API endpoints that may return a large set of results may implement paging. If there are too many results to fit in a single response, such API includes the field `nextToken` in its response. The next page is fetched by sending the received value back in a field with the same name `nextToken`.

Note that any endpoint listed here supporting paging may change its maximum page size in the future. Some APIs have huge page sizes (meaning no paging in effect), but the page size may be decreased in the future.

## API endpoints

A note on documentation syntax: `queryStringParameters` and `body` mentioned in the request schemas refer to HTTP GET querystring parameters and request body in the other HTTP methods.

You are not expected to send property `queryStringParameters` or `body` within the request body.

A note on JSON schema format: The schema of an object can include property `additionalProperties`. If not set or set to `true`, object properties that have not been defined are allowed. This means new properties can be added to the API without prior warning. If set to `false` this is not possible.

### GET https://api.xsitemanage.com/ext/0/site/sites?nextToken={nextToken}&maxPageSize={maxPageSize}

Get user's sites

[Request schema](api/0/site/sites/get/request.json)
[Response schema](api/0/site/sites/get/response.json)

### GET https://api.xsitemanage.com/ext/0/site/sites/machines?siteId={siteId}

Get sites machines

[Request schema](api/0/site/sites/machines/get/request.json)
[Response schema](api/0/site/sites/machines/get/response.json)

### GET https://api.xsitemanage.com/ext/1/point/points?siteId={siteId}&since={sequenceId}&nextToken={nextToken}&maxPageSize={maxPageSize}

Get log points for a site

[Request schema](api/1/point/points/get/request.json)
[Response schema](api/1/point/points/get/response.json)

### GET https://api.xsitemanage.com/ext/0/model/latest?siteId={siteId}&nextToken={nextToken}&maxPageSize={maxPageSize}

Get site files

[Request schema](api/0/model/latest/get/request.json)
[Response schema](api/0/model/latest/get/response.json)

### GET https://api.xsitemanage.com/ext/0/model/presign/file?siteId={siteId}&path={path}

Presign path in preparation of adding it to a site. May be a new path or update of existing one.

[Request schema](api/0/model/presign/get/request.json)
[Response schema](api/0/model/presign/get/response.json)

### POST https://api.xsitemanage.com/ext/0/model/command/add/file

Add a file in a temporary location in site model hierarchy. API expects content-type to be application/json

[Request schema](api/0/model/command/add/file/post/request.json)
[Response schema](api/0/model/command/add/file/post/response.json)

## MQTT endpoint

XsiteManage uses to MQTT over websocket to push notifications about machine activity on a site. To start listening for the messages connect MQTT client to the endpoint and subscribe to an activity topic. Only new events will be sent to the topic. Last known location is not available.

When connecting client to the endpoint, you need to pass clientId with the connection parameters.

clientId should conform to: "prod-user-{userId}-{sessionId}"
 - any string is allowed as an sessionId
 - userId is the email of the user logged in.

### wss://iot.prod.xsitemanage.com/mqtt?token={idToken}>&contextType=ext-site&contextId={siteId}

## topics:subscribe

Following topics are available for client to subscribe to.

### prod-ext/site:{siteId}/mcc:{machineId}/status

Single machine activity on a site

[Response schema](schema/mqtt-subscribe.json)

### prod-ext/site:{siteId}/+/status

All machine activity on a site

[Response schema](schema/mqtt-subscribe.json)
