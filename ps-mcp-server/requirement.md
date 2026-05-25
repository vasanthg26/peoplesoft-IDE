# PeopleSoft MCP Server

## Goal
Build an MCP server that connects AI
to PeopleSoft metadata via Oracle DB.

## What it does
Given a component name, expose MCP tools that return:
- Component structure and scroll levels
- All records and their types
- All fields with key information
- PeopleCode by event
- FUNCLIB functions

## Tech Stack
- Node.js
- MCP SDK
- node-oracledb
- Mock fallback when no DB access

## SQLs
All SQLs are in queries/sqls.md

## Important
- Read only DB access
- Must work with mock data when no DB connection
- Output must be clean JSON for AI consumption
- Component name is the main input parameter
