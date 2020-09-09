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


## API Usage

### Common parameters
For OAUTH2 based authorization, please see example code. Cors support is not available at the moment.

### Common errors
- 400 Bad request. Some request parameter is invalid
- 401 Unauthorized. Token valid, but no access to requested resource
- 403 Forbidden. Token is probably not valid

Application error response body: `schema/common-error-body.json`. Please note that systems in between the application and the client also produce error responses of different format.

### Paging
Api endpoints thay may return large set of results may implement paging. In
case there are too many results to fit in a single response, such api includes
field `lastEvaluatedKey` in its response. The next page is fetched by sending
the received value back in a field with the same name `lastEvaluatedKey`.

Note that any endpoint listed here are supporting paging may change its maximum
page size in the future. Some apis are initially implemented with huge page
size (meaning no paging in effect), but it may be decreased in the future.

## API endpoints

#### GET https://api.xsitemanage.com/ext/0/site/sites?lastEvaluatedKey={lastEvaluatedKey}&maxPageSize={maxPageSize}
Get user's sites

Parameters
- lastEvaluatedKey: Optional. For paging. Only used if given by an API response
- maxPageSize: Optional. For paging. A page will not contain more items that the given value

Response: `schema/sites-get-response.json`

#### GET https://api.xsitemanage.com/ext/0/site/allowed?siteId={siteId}
Check if caller has permissions for given site.

Parameters
- siteId: site id (string, uuid)

Response: Http status code only

#### PUT https://api.xsitemanage.com/ext/0/site/protection
Configure site file protection

Parameters
- siteId: site id (string, uuid)
- protection: Protection configuration like `{ "prefixes": { "protectedFolder/": "myCompany" } }`

Response: `schema/protection-put-response.json`

#### GET https://api.xsitemanage.com/ext/0/point/points?siteId={siteId}&lastEvaluatedKey={lastEvaluatedKey}&maxPageSize={maxPageSize}
Get log points for a site

Parameters
- siteId: site id (string, uuid)
- lastEvaluatedKey: Optional. For paging. Only used if given by an API response
- maxPageSize: Optional. For paging. A page will not contain more items that the given value

Response: `schema/points-get-response.json`

#### GET https://api.xsitemanage.com/ext/0/model/latest?siteId={siteId}&lastEvaluatedKey={lastEvaluatedKey}&maxPageSize={maxPageSize}
Get site files

Parameters
- siteId: site id (string, uuid)
- lastEvaluatedKey: Optional. For paging. Only used if given by an API response
- maxPageSize: Optional. For paging. A page will not contain more items that the given value

Response: `schema/model-get-response.json`

#### GET https://api.xsitemanage.com/ext/0/model/presign/file?siteId={siteId}&path={path}
Presign path in preparation of adding it to a site. May be a new path or update of existing one.

Parameters:
- siteId: site id (string, uuid)
- path: path

Response: `schema/presign-get-response.json`

#### POST https://api.xsitemanage.com/ext/0/model/command/add/file
Add file in temporary location to site model hierarchy

Parameters:
- siteId: site id (string, uuid)
- path: path of added file
- presignRequestId: Request id returned from preceding call to `model/presign/file`

Response: Empty object
