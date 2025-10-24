@echo off
echo ========================================
echo Database Update Script
echo ========================================
echo.
echo This will update your database schema to add:
echo - PasswordResetToken table (for password reset)
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause > nul
echo.
echo Running database push...
npx prisma db push
echo.
echo Generating Prisma Client...
npx prisma generate
echo.
echo ========================================
echo Database update complete!
echo ========================================
echo.
echo Next steps:
echo 1. Restart your server
echo 2. Test password reset functionality
echo.
pause

