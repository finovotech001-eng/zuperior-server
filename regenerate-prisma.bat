@echo off
echo Regenerating Prisma Client...
npx prisma generate
echo.
echo Done! Please restart your backend server.
pause

