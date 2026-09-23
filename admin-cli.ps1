# Convenience wrapper for Developer Admin Account Management (PowerShell)
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ArgsList
)

if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    docker exec -it hr_backend_container python manage_admin.py @ArgsList
} else {
    docker exec -i hr_backend_container python manage_admin.py @ArgsList
}
