'use strict';

exports.handler = (event, context, callback) => {
  console.log('hello world ssss');
  callback(null, 'hello world');
}