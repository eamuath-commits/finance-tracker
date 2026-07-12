export const exportToCSV = (data, filename = 'export.csv', headers = null) => {
    if (!data || !data.length) {
        console.warn("No data to export");
        return;
    }

    // 1. Determine Headers
    const csvHeaders = headers || Object.keys(data[0]);

    // 2. Convert Data to CSV String
    const csvRows = [
        csvHeaders.join(','), // Header Row
        ...data.map(row => {
            return csvHeaders.map(fieldName => {
                let val = row[fieldName];
                if (val === null || val === undefined) val = '';

                let stringVal = String(val);

                // Neutralize CSV formula injection: a leading =, +, -, @, or
                // control char makes Excel/Sheets execute the cell as a formula.
                // Merchant/category come from bank SMS, so treat them as hostile.
                if (/^[=+\-@\t\r]/.test(stringVal)) {
                    stringVal = "'" + stringVal;
                }

                // Escape quotes and wrap in quotes if necessary
                if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
                    return `"${stringVal.replace(/"/g, '""')}"`;
                }
                return stringVal;
            }).join(',');
        })
    ];

    const csvString = csvRows.join('\r\n');

    // 3. Create Blob with BOM for Excel UTF-8 compatibility
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });

    // 4. Trigger Download
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
