@echo off
chcp 65001 >nul
node tests\verify-release-files.cjs
if errorlevel 1 exit /b 1
if not defined PAYMENT_PYTHON set "PAYMENT_PYTHON=python"
"%PAYMENT_PYTHON%" -X utf8 tests\verify_js_syntax.py
if errorlevel 1 exit /b 1
node --test tests/index-v1/*.test.cjs tests/secure/*.test.cjs tests/regression/*.test.cjs
if errorlevel 1 exit /b 1
node tests\verify_preflight.cjs
if errorlevel 1 exit /b 1
node tests\test_import_two_pass.cjs
if errorlevel 1 exit /b 1
node tests\test_import_duplicate_equivalence.cjs
if errorlevel 1 exit /b 1
node tests\test_mep_targeted_refresh.cjs
if errorlevel 1 exit /b 1
node tests\test_export_watch_fallback.cjs
if errorlevel 1 exit /b 1
echo RC OFFLINE TESTS PASSED. Production requires separate user approval.
