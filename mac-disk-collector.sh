#!/bin/bash
# =============================================================================
# Mac Disk Collector — Textfile Collector for node_exporter
# =============================================================================
# Runs on the Mac every 5 minutes via cron/launchd.
#
# Usage:
#   sudo ./mac-disk-collector.sh           # normal mode (writes .prom file)
#   sudo ./mac-disk-collector.sh --debug   # debug mode (prints to stdout)
# =============================================================================

# Do NOT use 'set -e' — we want the script to continue even if commands fail
set +e

DEBUG=0
if [ "${1:-}" = "--debug" ] || [ "${1:-}" = "-d" ]; then
    DEBUG=1
fi

log() {
    if [ "$DEBUG" -eq 1 ]; then
        echo "[DEBUG] $*" >&2
    fi
}

TEXTFILE_DIR="${TEXTFILE_DIR:-/usr/local/var/node_exporter/textfile}"
PROM_FILE="${TEXTFILE_DIR}/mac_disk.prom"
TMP_FILE="${PROM_FILE}.$$"

log "TEXTFILE_DIR=${TEXTFILE_DIR}"
log "PROM_FILE=${PROM_FILE}"
log "TMP_FILE=${TMP_FILE}"
log "Running as user: $(whoami)"
log "Bash version: ${BASH_VERSION}"

# Create output directory
if ! mkdir -p "${TEXTFILE_DIR}" 2>/dev/null; then
    echo "ERROR: Cannot create directory ${TEXTFILE_DIR}" >&2
    echo "Try: sudo mkdir -p ${TEXTFILE_DIR}" >&2
    exit 1
fi

# Test we can write to it
if ! touch "${TMP_FILE}" 2>/dev/null; then
    echo "ERROR: Cannot write to ${TEXTFILE_DIR}" >&2
    echo "Try: sudo chown \$(whoami) ${TEXTFILE_DIR}" >&2
    exit 1
fi

log "Output directory OK, starting collection..."

# ---- Helper: sanitize label values for Prometheus ----
sanitize() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# ---- Collect metrics into the temp file ----
collect_all() {
    echo "# Mac disk collector - generated at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo ""

    # ---- 1. Per-directory sizes ----
    log "Collecting directory sizes..."
    echo "# HELP mac_directory_size_bytes Size of top-level directories in bytes."
    echo "# TYPE mac_directory_size_bytes gauge"

    for parent in /Users /Applications /Library /tmp /var /opt /usr/local; do
        if [ -d "$parent" ]; then
            log "  Scanning ${parent}..."
            # Scan immediate children
            du -sk "$parent"/* 2>/dev/null | while IFS='	' read -r size_kb path; do
                if [ -n "$size_kb" ] && [ -n "$path" ]; then
                    size_bytes=$((size_kb * 1024))
                    safe_path=$(sanitize "$path")
                    echo "mac_directory_size_bytes{path=\"${safe_path}\"} ${size_bytes}"
                fi
            done

            # Total for this parent
            total_line=$(du -sk "$parent" 2>/dev/null)
            if [ -n "$total_line" ]; then
                total_kb=$(echo "$total_line" | awk '{print $1}')
                if [ -n "$total_kb" ]; then
                    total_bytes=$((total_kb * 1024))
                    safe_parent=$(sanitize "$parent")
                    echo "mac_directory_size_bytes{path=\"${safe_parent}\"} ${total_bytes}"
                fi
            fi
        fi
    done
    log "Directory sizes done."

    echo ""

    # ---- 2. Per-user disk usage ----
    log "Collecting per-user usage..."
    echo "# HELP mac_user_disk_usage_bytes Disk usage per user home directory in bytes."
    echo "# TYPE mac_user_disk_usage_bytes gauge"

    if [ -d "/Users" ]; then
        for user_dir in /Users/*/; do
            [ -d "$user_dir" ] || continue
            user=$(basename "$user_dir")
            case "$user" in
                Shared|.localized|Guest) continue ;;
            esac
            log "  Scanning user: ${user}..."
            usage_line=$(du -sk "$user_dir" 2>/dev/null)
            if [ -n "$usage_line" ]; then
                usage_kb=$(echo "$usage_line" | awk '{print $1}')
                if [ -n "$usage_kb" ]; then
                    usage_bytes=$((usage_kb * 1024))
                    echo "mac_user_disk_usage_bytes{user=\"${user}\"} ${usage_bytes}"
                fi
            fi
        done
    fi
    log "Per-user usage done."

    echo ""

    # ---- 3. Recently modified large files (>50MB, last 60 minutes) ----
    log "Scanning for recent large files..."
    echo "# HELP mac_large_recent_file_bytes Recently modified files larger than 50MB."
    echo "# TYPE mac_large_recent_file_bytes gauge"

    find /Users /tmp /var/folders -maxdepth 5 -type f -mmin -60 -size +50M 2>/dev/null | head -50 | while read -r filepath; do
        if [ -n "$filepath" ]; then
            size_bytes=$(stat -f%z "$filepath" 2>/dev/null)
            owner=$(stat -f%Su "$filepath" 2>/dev/null)
            size_bytes="${size_bytes:-0}"
            owner="${owner:-unknown}"
            safe_path=$(sanitize "$filepath")
            echo "mac_large_recent_file_bytes{path=\"${safe_path}\",user=\"${owner}\"} ${size_bytes}"
        fi
    done
    log "Large files done."

    echo ""

    # ---- 4. Top processes by open writable file descriptors ----
    log "Collecting process open files..."
    echo "# HELP mac_process_open_writable_files Number of writable file descriptors per process."
    echo "# TYPE mac_process_open_writable_files gauge"

    lsof_output=$(lsof -n 2>/dev/null | awk '$4 ~ /[0-9]+[uw]/ {print $1}' | sort | uniq -c | sort -rn | head -20)
    if [ -n "$lsof_output" ]; then
        echo "$lsof_output" | while read -r count procname; do
            if [ -n "$count" ] && [ -n "$procname" ]; then
                echo "mac_process_open_writable_files{process=\"${procname}\"} ${count}"
            fi
        done
    fi
    log "Process open files done."

    echo ""

    # ---- 5. Disk I/O from iostat ----
    log "Collecting iostat..."
    echo "# HELP mac_iostat_mb_per_sec Current disk throughput from iostat in MB/s."
    echo "# TYPE mac_iostat_mb_per_sec gauge"

    iostat_line=$(iostat -d -c 2 -w 3 2>/dev/null | tail -1)
    if [ -n "$iostat_line" ]; then
        echo "$iostat_line" | awk '{
            if (NF >= 3) {
                printf "mac_iostat_mb_per_sec{device=\"disk0\"} %.2f\n", $3
            }
        }'
    fi
    log "iostat done."
}

# ---- Main ----
log "Starting collection..."

if [ "$DEBUG" -eq 1 ]; then
    # Debug mode: print to stdout
    collect_all
    echo ""
    echo "[DEBUG] Collection complete. Output above would be written to ${PROM_FILE}" >&2
else
    # Normal mode: write to file
    collect_all > "${TMP_FILE}" 2>/dev/null
    mv "${TMP_FILE}" "${PROM_FILE}"
    echo "$(date): Wrote metrics to ${PROM_FILE}" >> /tmp/mac-disk-collector.log
fi
