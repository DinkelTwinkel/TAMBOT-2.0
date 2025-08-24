@echo off
echo.
echo ================================================================================
echo                    TAMBOT 2.0 - Mine Image Generator
echo ================================================================================
echo.
echo This will generate all missing mine images for your bot.
echo.
echo Press any key to start generation...
pause > nul

node generateMineImages.js

echo.
echo ================================================================================
echo Process complete! Check the console output above for details.
echo ================================================================================
echo.
echo Press any key to exit...
pause > nul
