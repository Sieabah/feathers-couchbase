'use strict';

/* eslint-disable indent */

const debug = require('debug')('feathers-couchbase:QueryBuilder');
const QueryError = require('./queryerror');
const { interpret: QueryInterpreter } = require('./queryinterpreter');

class QueryBuilder {
  /**
   * @param bucket {string} Bucket name
   */
  constructor (bucket = null) {
    debug(`Create query with bucket '${bucket}'`);
    this.bucket = bucket;
    this.query = [];
    this._values = [];
  }

  _parameterValue (value) {
    this._values.push(value);
    return `$${this._values.length}`;
  }

  _getQueryValues () {
    return this._values.map(a => a);
  }

  _add (type, params) {
    debug(`Add parameter of type '${type}' with parameters '${JSON.stringify(params)}'`);
    this.query.push({ type, params });
  }

  select (...selected) {
    this._add('select', selected);
  }

  from (name) {
    this._add('from', name);
  }

  limit (amount) {
    if (amount == null) {
      throw new QueryError('Amount must be specified');
    }

    this._add('limit', amount);
  }

  skip (amount) {
    if (amount == null) {
      throw new QueryError('Amount must be specified');
    }

    this._add('skip', amount);
  }

  sort (fields, order = 'ASC') {
    if (fields == null) {
      throw new QueryError('Required to have at least one field to sort');
    }

    if (typeof fields === 'string') {
      fields = [fields];
    }

    if (!~['ASC', 'DESC'].indexOf(order.toUpperCase())) {
      throw new QueryError('Order must be ASC or DESC');
    }

    this._add('sort', { fields, order: order.toUpperCase() });
  }

  where (field, operation, value) {
    this._add(operation, { field, value });
  }

  rawWhere (value) {
    this._add('rawWhere', value);
  }

  _select (components, bucket) {
    // query.$select -> SELECT
    if (components == null) {
      components = ['*'];
    }

    if (bucket != null) {
      components = components.map((component) => `\`${bucket}\`.${component}`);
    }

    return `SELECT ${components.join(',')}`;
  }

  _from (bucket) {
    return `FROM \`${bucket}\``;
  }

  _where (components, operation = 'AND', addWhere = true) {
    let statements = [];

    for (let component of components) {
      let { field, value } = component.params;

      if (value == null) {
        value = 'NULL';
      } else {
        value = this._parameterValue(value);
      }

      // query.$in -> IN
      // query.$nin -> NOT IN
      // query.$lt -> WHERE x < n
      // query.$lte -> WHERE x <= n
      // query.$gt -> WHERE x > n
      // query.$gte -> WHERE x >= n
      // query.$ne -> WHERE x != n
      // query.$eq -> WHERE x == n
      // query.$or -> OR
      switch (component.type) {
        case 'lt':
          statements.push(`${field} < ${value}`);
          break;
        case 'lte':
          statements.push(`${field} <= ${value}`);
          break;
        case 'gt':
          statements.push(`${field} > ${value}`);
          break;
        case 'gte':
          statements.push(`${field} >= ${value}`);
          break;
        case 'ne':
          statements.push(`${field} != ${value}`);
          break;
        case 'eq':
          statements.push(`${field} = ${value}`);
          break;
        case 'in':
          statements.push(`${field} IN ${value}`);
          break;
        case 'nin':
          statements.push(`${field} NOT IN ${value}`);
          break;
        default:
          throw new Error('Not implemented');
      }
    }

    return `WHERE ${statements.join(` ${operation.toUpperCase()} `)}`;
  }

  _sort (groups) {
    const statements = [];
    for (let group of groups) {
      const { fields, order } = group;

      statements.push(`${fields.map(field => [this._parameterValue(field), order].join(' ')).join(', ')}`);
    }
    return `ORDER BY ${statements.join(', ')}`;
  }

  _limit (amount) {
    return `LIMIT ${amount}`;
  }

  _skip (amount) {
    return `OFFSET ${amount}`;
  }

  /**
   * Build wheres from QueryInterpreter AND|OR directive
   * @param sub {object} Sub directive
   * @param comparator {str} comparator
   * @returns {string}
   * @private
   */
  _buildWhere (sub, comparator = 'AND') {
    const statements = [];
    /**
     * Stringifies the query part
     * @param part
     * @returns {string}
     */
    const stringify = (part) => {
      if (part.value != null) { part.value = this._parameterValue(part.value); }

      return part.toString();
    };

    // If it's not an array, stringify it
    if (!Array.isArray(sub)) { return stringify(sub); }

    // For each query-part
    for (let part of sub) {
      // If an array is present, it's a nested object
      if (Array.isArray(part)) {
        for (let subpart of part) {
          statements.push(stringify(subpart));
        }
      } else if (~['and', 'or'].indexOf(part.directive.type)) {
        // Ensure AND/OR is wrapped correctly
        statements.push(['(', ')'].join(this._buildWhere(part.value, part.directive.type.toUpperCase())));
      } else {
        statements.push(stringify(part));
      }
    }

    return statements.join(` ${comparator} `);
  }

  /**
   * Interpret QueryInterpreter Directives
   * @param query {Object} Query Array
   * @returns {{query, values}}
   */
  interpret (query) {
    const interpretedQuery = QueryInterpreter(query);

    for (let component of interpretedQuery) {
      switch (component.directive.type) {
        case 'select':
          this.select(...component.value);
          break;
        case 'skip':
          this.skip(component.value);
          break;
        case 'limit':
          this.limit(component.value);
          break;
        case 'sort':
          for (let { field, value } of component.value) {
            this.sort(field, value > 0 ? 'ASC' : 'DESC');
          }
          break;
        case 'and':
          this.rawWhere(this._buildWhere(component.value));
          break;
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte':
        case 'ne':
        case 'in':
        case 'nin':
        case 'eq':
          throw new QueryError(`Found sub directive ${component.directive.type} at root query`);
      }
    }

    return this.build();
  }

  /**
   * Build N1QL Query
   * @returns {{query: string, values: *}}
   */
  build () {
    let $select = null;
    let $from = this.bucket;
    let $where = [];
    let $rawWhere = null;
    let $limit = null;
    let $skip = null;
    let $sort = [];

    const isNumeric = (n) => !isNaN(parseFloat(n)) && isFinite(n);

    for (let component of this.query) {
      switch (component.type) {
        case 'from':
          $from = component.params;
          break;
        // query.$select -> SELECT
        case 'select':
            $select = component.params;
          break;
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte':
        case 'ne':
        case 'in':
        case 'nin':
        case 'or':
        case 'eq':
          $where.push(component);
          break;
        case 'rawWhere':
          $rawWhere = component;
          break;
        // query.$limit -> LIMIT
        case 'limit':
          if (!isNumeric(component.params)) {
            throw new QueryError('Limit parameter must be numeric');
          }

          $limit = parseInt(component.params);
          break;
        // query.$skip -> OFFSET
        case 'skip':
          if (!isNumeric(component.params)) {
            throw new QueryError('Skip parameter must be numeric');
          }

          $skip = parseInt(component.params);
          break;
        // query.$sort -> ORDER
        case 'sort':
          $sort.push(component.params);
          break;
      }
    }

    let $query = [];

    $query.push(this._select($select, $from));

    if (this.bucket) { $query.push(this._from($from)); }

    if ($where.length > 0) { $query.push(this._where($where)); }

    if ($rawWhere != null) { $query.push(['WHERE', $rawWhere.params].join(' ')); }

    if ($sort.length > 0) { $query.push(this._sort($sort)); }

    if ($limit != null) { $query.push(this._limit($limit)); }

    if ($skip != null) { $query.push(this._skip($skip)); }

    const values = this._getQueryValues();
    debug(`Build query is ${$query}, with values ${values}`);
    return { query: $query.join(' '), values: values };
  }
}

module.exports = QueryBuilder;

/* eslint-enable indent */
