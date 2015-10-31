// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const crypto = require('crypto');
const Url = require('url');

const omclient = require('omclient').client;

const BaseDevice = require('../../base_device');

const OmletMessaging = require('./omlet_messaging');

const API_KEY = '00109b1ea59d9f46d571834870f0168b5ed20005871d8752ff';
const API_SECRET = 'bccb852856c462e748193d6211c730199d62adcf0ba963416fcc715a2db4d76f';

// XOR these comments for testing
var THINGENGINE_ORIGIN = 'http://127.0.0.1:8080';
//var THINGENGINE_ORIGIN = 'https://thingengine.stanford.edu';

const DeviceStateStorage = new lang.Class({
    Name: 'DeviceStateStorage',

    _init: function(device, backingObject) {
        this._device = device;
        this._storage = backingObject || {};
        this._stateChangedQueued = false;
    },

    _queueStateChanged: function() {
        if (this._stateChangedQueued)
            return;

        this._stateChangedQueued = true;
        setTimeout(function() {
            if (this._device !== null)
                this._device.stateChanged();
        }.bind(this), 0);
    },

    serialize: function() {
        return this._storage;
    },
    setBackingStorage: function(storage) {
        this._storage = storage;
    },

    key: function(idx) {
        return Object.keys(this._storage)[idx];
    },
    getItem: function(key) {
        return this._storage[key];
    },
    setItem: function(key, value) {
        this._storage[key] = value;
        this._queueStateChanged();
    },
    removeItem: function(key) {
        delete this._storage[key];
        this._queueStateChanged();
    },
    clear: function() {
        this._storage = {};
        this._queueStateChanged();
    }
});

function makeOmletClient(instance, storage, sync) {
    return new omclient.Client({ instance: instance,
                                 storage: storage,
                                 sync: sync,
                                 apiKey: { Id: API_KEY, Secret: API_SECRET } });
}

const OmletDevice = new lang.Class({
    Name: 'OmletDevice',
    Extends: BaseDevice,

    _init: function(engine, state) {
        this.parent(engine, state);

        this.name = "Omlet Account of %s".format(this.omletId);
        this.description = "This is your Omlet Account. You can use it to communicate and share data with your friends!";

        this.uniqueId = 'omlet-' + this.omletInstance;

        this._omletStorage = null;
        this._omletClient = null;
        this._omletClientCount = 0;
    },

    updateState: function(newstate) {
        this.parent(newstate);
        if (this._omletStorage !== null)
            this._omletStorage.setBackingStorage(this.state.storage);
    },

    get omletInstance() {
        return this.state.instance;
    },

    get omletId() {
        return this.state.omletId;
    },

    get omletStorage() {
        if (this._omletStorage !== null)
            return this._omletStorage;

        this._omletStorage = new DeviceStateStorage(this, this.state.storage);
        return this._omletStorage;
    },

    get omletClient() {
        if (this._omletClient !== null)
            return this._omletClient;

        this._omletClient = makeOmletClient(this.omletInstance, this.omletStorage, true);
        return this._omletClient;
    },

    refOmletClient: function() {
        var client = this.omletClient;

        if (this._omletClientCount == 0)
            client.enable();
        this._omletClientCount ++;
        return client;
    },

    unrefOmletClient: function() {
        var client = this.omletClient;

        setTimeout(function() {
            this._omletClientCount --;
            if (this._omletClientCount == 0)
                client.disable();
        }, 5000);
    },

    hasKind: function(kind) {
        switch(kind) {
        case 'online-account':
        case 'messaging':
            return true;
        default:
            return this.parent(kind);
        }
    },

    queryInterface: function(iface) {
        if (iface === 'omlet')
            return this.omletClient;
        else if (iface === 'messaging')
            return new OmletMessaging(this);
        else
            return null;
    },

    checkAvailable: function() {
        return BaseDevice.Availability.AVAILABLE;
    },
});

function createDevice(engine, state) {
    return new OmletDevice(engine, state);
}

function runOAuth2Phase1() {
    var buf = crypto.randomBytes(8).toString('hex');
    var storage = new DeviceStateStorage(null, undefined);
    var client = makeOmletClient(buf, storage, false);
    console.log('Obtained omlet Client');

    return Q.try(function() {
        client.enable();

        return Q.ninvoke(client.auth, 'getAuthPage',
                         THINGENGINE_ORIGIN + '/devices/oauth2/callback/omlet',
                         ['PublicProfile', 'OmletChat']);
    }).then(function(resp) {
        console.log('Obtained omlet auth page response');

        var parsed = Url.parse(resp.Link, true);
        return [resp.Link, { 'omlet-query-key': parsed.query.k,
                             'omlet-instance': buf,
                             'omlet-storage': JSON.stringify(storage.serialize()) }];
    }).finally(function() {
        return client.disable();
    }).catch(function(e) {
        console.log(String(e));
        console.log(e.stack);
        throw e;
    });
}

function runOAuth2Phase2(engine, req) {
    var storageState = JSON.parse(req.session['omlet-storage']);
    var instance = req.session['omlet-instance'];
    var storage = new DeviceStateStorage(null, storageState);
    var client = makeOmletClient(instance, storage, false);
    console.log('Obtained omlet Client');

    var code = req.query.code;
    var key = req.session['omlet-query-key'];

    return Q.Promise(function(callback, errback) {
        client.enable();

        client.onSignedUp = callback;
        client.auth.confirmAuth(code, key);
    }).then(function() {
        return engine.devices.loadOneDevice({ kind: 'omlet',
                                              omletId: null,
                                              instance: instance,
                                              storage: storage.serialize() }, true);
    }).finally(function() {
        client.disable();
    });
}

function runOAuth2(engine, req) {
    if (req === null)
        return runOAuth2Phase1();
    else
        return runOAuth2Phase2(engine, req);
}
module.exports.createDevice = createDevice;
module.exports.runOAuth2 = runOAuth2;