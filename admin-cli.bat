@echo off
REM Convenience wrapper for Developer Admin Account Management
docker exec -it hr_backend_container python manage_admin.py %*
