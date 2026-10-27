'use strict';
const { createSiteProvider } = require('../../core/site-provider.js');
module.exports = createSiteProvider({ id: 'pinterest', name: 'Pinterest',
    hosts: ['pinterest.com', 'pin.it'],
    mediaHosts: ['pinterest.com', 'pinimg.com'] });
