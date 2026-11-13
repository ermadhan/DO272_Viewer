@echo off
echo Starting DO-272 Model Context Protocol (MCP) Server... 1>&2
call venv\Scripts\activate
python mcp_server.py
