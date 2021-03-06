# feathersjs-couchbase DEPRECATED

[![Build Status](https://travis-ci.org/Sieabah/feathersjs-couchbase.svg?branch=master)](https://travis-ci.org/Sieabah/feathersjs-couchbase)
[![Maintainability](https://api.codeclimate.com/v1/badges/ac6cb7962df1a5a5958a/maintainability)](https://codeclimate.com/github/Sieabah/feathersjs-couchbase/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/ac6cb7962df1a5a5958a/test_coverage)](https://codeclimate.com/github/Sieabah/feathersjs-couchbase/test_coverage)
[![Dependencies Status](https://david-dm.org/sieabah/feathersjs-couchbase/status.svg)](https://david-dm.org/sieabah/feathersjs-couchbase)
[![Download Status](https://img.shields.io/npm/dt/feathersjs-couchbase.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-couchbase)

> FeathersJS DB adapter for couchbase

# Project is deprecated, will not maintain any further

## Installation

```
npm install feathersjs-couchbase --save
``` 

### Warning about N1QL Injections

This library only sanitizes *values* and *does not* sanitize any keys. It is a plan to build into the query builder
a sanitization layer but for now it is open to attacks. This can be easily mitigated by validating your input and 
excluding any keys not expected from your input.

```
{
  "; SELECT * FROM `admin`; /*": "*/"
}
``` 

## Documentation

```
const couchbase = require('couchbase')
const cluster = new couchbase.Cluster('couchbase://127.0.0.1')
const bucketName = 'default';
const bucket = cluster.openBucket(bucketName)

const config = {
  name: 'users', // Name of service and key prefix (REQUIRED)
  bucket: bucketName, // Couchbase bucket name (REQUIRED)
  connection: bucket, // Bucket connection, or promise that resolves to connection (REQUIRED)
  
  separator: '::' // optional key separator (defaults to `::`)
  couchbase: couchbase, // optional couchbase dependency (OPTIONAL)
  id: 'id', // ID field to use (OPTIONAL) (defaults to `uuid`)
  paginate: app.get('paginate'), // (OPTIONAL)
};

// Initialize our service with all options it requires
app.use(`/${options.name}`, new Service(options));
 
const createService = require('feathersjs-couchbase')
  
// Method 1
app.use('/',createService(config));
 
// Method 2
const { CouchService } = require('feathersjs-couchbase');
new CouchService(config)
```

### Recommended Service Creation

```
'use strict';

const { CouchService } = require('feathersjs-couchbase');

class Users extends CouchService {
  constructor(opts){
    super(opts);
  }

  create(data, params){
    return super.create(
      Object.assign({ // Your default data here
        auth0Id: null,
        role: 'default',
      }, data) // Data passed in
    , params);
  }
}

module.exports = Rooms;
```

### API

The library implements the full [feathersjs common api](https://docs.feathersjs.com/api/databases/common.html) and 
[Query api](https://docs.feathersjs.com/api/databases/querying.html), see limitations for exceptions.

> **Finds will not work until an index is built over the bucket you're trying to query**

#### Additional API

##### $consistency (_only_ valid on Service.find)
N1QL Consistency special parameter. [Consistency Documentation](https://docs.couchbase.com/server/5.5/indexes/performance-consistency.html)

```
const { QueryConsistency } = require('feathersjs-couchbase');

Service.find({
  query: {
    $consistency: QueryConsistency.NOT_BOUNDED
    ... 
  }
});
```
Consistency Levels:
- NOT_BOUNDED
- REQUEST_PLUS
- STATEMENT_PLUS

Omitting $consistency results in the default consistency of 'at_plus';

##### $return (_only_ valid on Service.remove)
Due to the nature of removing items, you may want to retrieve the CAS value. Calling `Service.remove(..., { $return: true })` will remove the 
entity and return the removed CAS value instead of the original object.

## Limitations

- Subqueries are not supported
- Only tested with feathers v3
- $selects on Service.find calls pulls all data and removes sections locally
- Does not _validate_ query logic, a query with a directive and value results in 
an invalid query (`{ thing: { one: 1, $lt: 2 } }`) --> `thing.one = 1 AND thing < 2`

## License

Copyright (c) 2018

Licensed under the [MIT license](LICENSE).

## Contributing

### Definitions

- Directives - A directive as used in this project is a special query definition. An
example of a directive would be $in, $limit, or $skip.

- SingleValueDirective and FieldValueDirective are both directives (usually equality) 
that relate a singular value or a mapped field. A mapped field can either be a directive 
itself or a subvalue of a parent object.
```
query: {
  //Results in a FieldValueDirective that builds `top < $1`
  top: {
    $lt: 1
  },
  //Results in a FieldValueDirective that builds `sub.one = $2`
  sub: {
    one: 1
  }
}
```

## Changelog

v3.0.1:

- Fix service.find() queries
- Update ramda

v3.0.0:

- Remove dependency on unmaintained couchbase-promise library (couchbase > request > @hapi/hawk)

v2.5.0:

- Error when incorrect query directives are provided at root level

v2.4.0:

- Adds multi-access support to create function

v2.3.0:

- Support for nested subobjects added. The following query results in `one.two = 1` 
```
query: {
  one: {
    two: 1
  }
}
```

v2.2.0:

- On service.remove the original object is returned by default.
