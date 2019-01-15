// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const Type = require('thingtalk').Type;

async function testTableCreation(engine) {
    await engine.memory.createTable('test', ['arg1', 'arg2'], [Type.String, Type.Number]);
    let hasTable = await engine.memory.hasTable('test');
    assert.strictEqual(!!hasTable, true);

    let schema = await engine.memory.getSchema('test');
    assert.deepStrictEqual(schema.args, ['arg1', 'arg2']);
    assert.deepStrictEqual(schema.types, [Type.String, Type.Number]);
}

async function testInsertion(engine) {
    await engine.memory.insertOne('test', [], ['testString', 11]);
    let query = await engine.memory.get('test', null, null);

    let iterator = query[Symbol.iterator]();
    let {done, value} = await iterator.next();
    while (!done) {
        assert.strictEqual(value[2][2], 'testString');
        assert.strictEqual(value[2][3], 11);

        const obj = await iterator.next();
        done = obj.done;
        value = obj.value;
    }
}

async function testTableDeletion(engine) {
    await engine.memory.deleteTable('test');
    let hasTable = await engine.memory.hasTable('test');
    assert.strictEqual(!!hasTable, false);
}

module.exports = async function testMemory(engine) {
    await testTableCreation(engine);
    await testInsertion(engine);
    await testTableDeletion(engine);
};
