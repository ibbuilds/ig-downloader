'use strict';
const { createSiteProvider } = require('../../core/site-provider.js');
module.exports = createSiteProvider({ id: 'twitter', name: 'X / Twitter',
    hosts: ['x.com', 'twitter.com'],
    mediaHosts: ['x.com', 'twitter.com', 'twimg.com'] });
