'use strict';
const { createSiteProvider } = require('../../core/site-provider.js');
module.exports = createSiteProvider({ id: 'facebook', name: 'Facebook',
    hosts: ['facebook.com', 'fb.watch'],
    mediaHosts: ['facebook.com', 'fbcdn.net', 'cdninstagram.com'] });
