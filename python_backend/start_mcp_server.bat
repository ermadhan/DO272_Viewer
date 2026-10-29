@echo off
echo Starting DO-272 PostGIS Model Context Protocol (MCP) Server...
call venv\Scripts\activate
python mcp_server.py
