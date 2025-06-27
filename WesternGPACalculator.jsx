import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, Upload, FileText, Save, Download, TrendingUp, Award, Target, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as PDFJS from 'pdfjs-dist';

// PDF.js worker config
// For production, you may serve the worker locally for offline support and performance.
// Example (if using Webpack/Vite and pdfjs-dist >= 3.x):
// import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';
// PDFJS.GlobalWorkerOptions.workerSrc = pdfWorker;
PDFJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.min.mjs`;

const WesternGPACalculator = () => {
    const [courses, setCourses] = useState([
        { id: 1, name: '', percentage: '', credits: '1.0', semester: '2023-Fall', isValid: true }
    ]);
    const [gpa, setGPA] = useState(null);
    const [averageGrade, setAverageGrade] = useState(null);
    const [semesterGPAs, setSemesterGPAs] = useState({});
    const [uploadStatus, setUploadStatus] = useState('');
    const [activeTab, setActiveTab] = useState('calculator');
    const [whatIfTarget, setWhatIfTarget] = useState('3.5');
    const [whatIfCredits, setWhatIfCredits] = useState('2.0');
    const [formErrors, setFormErrors] = useState({});

    // Western University Grade Scale
    const gradeScale = [
        { min: 90, max: 100, gpa: 4.0, letter: 'A+' },
        { min: 85, max: 89, gpa: 3.9, letter: 'A' },
        { min: 80, max: 84, gpa: 3.7, letter: 'A-' },
        { min: 77, max: 79, gpa: 3.3, letter: 'B+' },
        { min: 73, max: 76, gpa: 3.0, letter: 'B' },
        { min: 70, max: 72, gpa: 2.7, letter: 'B-' },
        { min: 67, max: 69, gpa: 2.3, letter: 'C+' },
        { min: 63, max: 66, gpa: 2.0, letter: 'C' },
        { min: 60, max: 62, gpa: 1.7, letter: 'C-' },
        { min: 57, max: 59, gpa: 1.3, letter: 'D+' },
        { min: 53, max: 56, gpa: 1.0, letter: 'D' },
        { min: 50, max: 52, gpa: 0.7, letter: 'D-' },
        { min: 0, max: 49, gpa: 0.0, letter: 'F' }
    ];

    const semesters = [
        '2023-Fall', '2024-Winter', '2024-Fall', '2025-Winter', '2025-Fall', '2026-Winter',
        '2026-Fall', '2027-Winter', '2027-Fall', '2028-Winter'
    ];

    // --- Utility: Parse Course Line (for DRY code) ---
    function parseCourseLine({ courseName, percentage, credits, semester, id, isValid = true }) {
        if (!courseName || isNaN(percentage) || percentage < 0 || percentage > 100 || credits <= 0) return null;
        return {
            id,
            name: courseName.trim(),
            percentage: percentage.toString(),
            credits: credits.toString(),
            semester,
            isValid
        };
    }

    // --- Defensive localStorage load ---
    useEffect(() => {
        try {
            const savedData = JSON.parse(localStorage.getItem('westernGPAData') || '{}');
            if (savedData.courses && Array.isArray(savedData.courses) && savedData.courses.length > 0) {
                setCourses(savedData.courses.map(course => ({ ...course, isValid: true })));
            }
        } catch (e) {
            setUploadStatus('Error reading saved data from your browser. Data has been reset.');
            setCourses([{ id: 1, name: '', percentage: '', credits: '1.0', semester: '2023-Fall', isValid: true }]);
            setTimeout(() => setUploadStatus(''), 5000);
        }
    }, []);

    const convertPercentageToGPA = (percentage) => {
        const num = parseFloat(percentage);
        if (isNaN(num)) return null;
        const grade = gradeScale.find(g => num >= g.min && num <= g.max);
        return grade ? grade.gpa : null;
    };

    const convertGPAToPercentage = (gpa) => {
        const gpaNum = parseFloat(gpa);
        if (isNaN(gpaNum)) return null;
        const grade = gradeScale.find(g => g.gpa === parseFloat(gpaNum.toFixed(1)));
        return grade ? grade.min : null;
    };

    const saveData = () => {
        const dataToSave = { courses: courses.map(({ isValid, ...rest }) => rest), gpa, semesterGPAs };
        localStorage.setItem('westernGPAData', JSON.stringify(dataToSave));
        setUploadStatus('Data saved successfully!');
        setTimeout(() => setUploadStatus(''), 2000);
    };

    const exportData = () => {
        const dataToExport = { courses: courses.map(({ isValid, ...rest }) => rest), gpa, semesterGPAs, exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'western-gpa-data.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Helper to find column index by header name (case-insensitive, partial match)
    const findColumnIndex = (headers, names) => {
        for (const name of names) {
            const index = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().includes(name.toLowerCase()));
            if (index !== -1) return index;
        }
        return -1;
    };

    // --- File Size Limit (10MB for example) ---
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    const parseCSVTranscript = async (file) => {
        setUploadStatus('Processing CSV transcript...');
        try {
            const csvText = await file.text();
            const lines = csvText.split('\n');
            const parsedCourses = [];
            let id = 1;

            let headers = [];
            let startRow = 0;

            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                if (firstLine.toLowerCase().includes('course') || firstLine.toLowerCase().includes('name') || firstLine.toLowerCase().includes('grade')) {
                    headers = firstLine.split(',').map(col => col.trim().replace(/"/g, ''));
                    startRow = 1;
                }
            }

            const courseNameCol = findColumnIndex(headers, ['course', 'name', 'subject']);
            const percentageCol = findColumnIndex(headers, ['percentage', 'grade', 'mark']);
            const creditsCol = findColumnIndex(headers, ['credits', 'credit', 'weight']);
            const semesterCol = findColumnIndex(headers, ['semester', 'term', 'session']);

            for (let i = startRow; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));

                let courseName = columns[courseNameCol] || columns[0];
                let percentage = parseFloat(columns[percentageCol] || columns[1]);
                let credits = parseFloat(columns[creditsCol] || columns[2]) || 1.0;
                let semester = columns[semesterCol] || semesters[semesters.length - 1];

                // Use DRY utility
                const course = parseCourseLine({ courseName, percentage, credits, semester, id: id++ });
                if (course) parsedCourses.push(course);
            }

            if (parsedCourses.length > 0) {
                setCourses(parsedCourses);
                setUploadStatus(`Successfully parsed ${parsedCourses.length} courses from CSV!`);
                setTimeout(() => setUploadStatus(''), 3000);
            } else {
                setUploadStatus('No valid courses found in CSV. Ensure columns like "Course", "Grade%", "Credits", "Semester" are present.');
                setTimeout(() => setUploadStatus(''), 7000);
            }
        } catch (error) {
            console.error("Error parsing CSV:", error);
            setUploadStatus('Error reading CSV file. Please ensure it\'s a valid .csv file with expected columns.');
            setTimeout(() => setUploadStatus(''), 7000);
        }
    };

    const parseExcelTranscript = async (file) => {
        setUploadStatus('Processing Excel transcript...');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            const parsedCourses = [];
            let id = 1;

            let headers = [];
            let startRow = 0;

            if (data.length > 0 && Array.isArray(data[0])) {
                const firstRow = data[0];
                if (firstRow.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('course') || cell.toLowerCase().includes('name') || cell.toLowerCase().includes('grade')))) {
                    headers = firstRow.map(cell => typeof cell === 'string' ? cell.trim() : '');
                    startRow = 1;
                }
            }

            const courseNameCol = findColumnIndex(headers, ['course', 'name', 'subject']);
            const percentageCol = findColumnIndex(headers, ['percentage', 'grade', 'mark']);
            const creditsCol = findColumnIndex(headers, ['credits', 'credit', 'weight']);
            const semesterCol = findColumnIndex(headers, ['semester', 'term', 'session']);

            for (let i = startRow; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length < 1) continue;

                let courseName = row[courseNameCol] || row[0];
                let percentage = parseFloat(row[percentageCol] || row[1]);
                let credits = parseFloat(row[creditsCol] || row[2]) || 1.0;
                let semester = row[semesterCol] || semesters[semesters.length - 1];

                const course = parseCourseLine({ courseName, percentage, credits, semester, id: id++ });
                if (course) parsedCourses.push(course);
            }

            if (parsedCourses.length > 0) {
                setCourses(parsedCourses);
                setUploadStatus(`Successfully parsed ${parsedCourses.length} courses from Excel file!`);
                setTimeout(() => setUploadStatus(''), 3000);
            } else {
                setUploadStatus('No valid courses found in Excel file. Ensure columns like "Course", "Grade%", "Credits", "Semester" are present.');
                setTimeout(() => setUploadStatus(''), 7000);
            }
        } catch (error) {
            console.error("Error parsing Excel:", error);
            setUploadStatus('Error reading Excel file. Please ensure it\'s a valid .xlsx or .xls file with expected columns.');
            setTimeout(() => setUploadStatus(''), 7000);
        }
    };

    // This function will now be used for both TXT and PDF extracted text
    const parseTxtOrPdfText = (text) => {
        const lines = text.split('\n');
        const parsedCourses = [];
        let id = 1;
        let currentSemester = semesters[semesters.length - 1];

        const westernCoursePattern = /([A-Z]{2,10}\s+\d{3,4}[A-Z]*)\s+(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d{1,3})\s*$/;

        const generalPatterns = [
            /^([A-Z]{2,10}\s+\d{3,4}[A-Z]*)\s+(\d+\.\d+)\s+(\d{1,3}(\.\d+)?)\s*$/,
            /^([A-Z]{2,10}\s+\d{3,4}[A-Z]*)\s+(\d{1,3}(\.\d+)?)\s+(\d+\.\d+)\s*$/,
            /^"?(.*?)"?,\s*(\d{1,3}(\.\d*)?),\s*(\d+\.\d+)\s*$/
        ];

        const excludedKeywords = [
            'student name', 'print date', 'manitoba grade', 'basis of admission', 'page', 'faculty of',
            'beginning of undergraduate record', 'program:', 'plan:', 'honor:', 'term honor:',
            'scholarships and grants', 'end of western university unofficial transcript'
        ].map(k => k.toLowerCase());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const lowerLine = line.toLowerCase();
            if (excludedKeywords.some(keyword => lowerLine.includes(keyword)) ||
                (lowerLine.includes('course') && lowerLine.includes('grade') && lowerLine.includes('credits')) ||
                lowerLine.includes('the following table:')
            ) {
                continue;
            }

            const semesterYearMatch = line.match(/(20\d{2})\s*(Fall\/Winter|Fall|Winter|Summer)/i);
            if (semesterYearMatch) {
                currentSemester = `${semesterYearMatch[1]}-${semesterYearMatch[2].replace('/Winter', '-Winter')}`;
                continue;
            }

            let foundMatch = false;
            const westernMatch = line.match(westernCoursePattern);
            if (westernMatch) {
                const courseName = `${westernMatch[1]}`;
                const credits = parseFloat(westernMatch[3]);
                const percentage = parseFloat(westernMatch[5]);
                const course = parseCourseLine({ courseName, percentage, credits, semester: currentSemester, id: id++ });
                if (course) {
                    parsedCourses.push(course);
                    foundMatch = true;
                }
            }

            if (!foundMatch) {
                for (const pattern of generalPatterns) {
                    const courseMatch = line.match(pattern);
                    if (courseMatch) {
                        let courseName, percentageStr, creditsStr;
                        if (pattern === generalPatterns[0]) {
                            courseName = courseMatch[1];
                            creditsStr = courseMatch[2];
                            percentageStr = courseMatch[3];
                        } else if (pattern === generalPatterns[1]) {
                            courseName = courseMatch[1];
                            percentageStr = courseMatch[2];
                            creditsStr = courseMatch[3];
                        } else if (pattern === generalPatterns[2]) {
                            courseName = courseMatch[1];
                            percentageStr = courseMatch[2];
                            creditsStr = courseMatch[3];
                        }
                        const percentage = parseFloat(percentageStr);
                        const credits = parseFloat(creditsStr) || 1.0;
                        const course = parseCourseLine({ courseName, percentage, credits, semester: currentSemester, id: id++ });
                        if (course) {
                            parsedCourses.push(course);
                            foundMatch = true;
                            break;
                        }
                    }
                }
            }
        }
        return parsedCourses;
    };

    const handlePdfUpload = async (file) => {
        setUploadStatus('Processing PDF transcript (this may take a moment)...');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFJS.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map(item => item.str).join(' ') + '\n';
            }

            const parsedCourses = parseTxtOrPdfText(fullText);

            if (parsedCourses.length > 0) {
                setCourses(parsedCourses);
                setUploadStatus(`Successfully parsed ${parsedCourses.length} courses from PDF! Review and adjust if needed.`);
                setTimeout(() => setUploadStatus(''), 5000);
            } else {
                setUploadStatus('Could not find courses in PDF. Text extraction might be difficult due to PDF format (e.g., scanned images) or unrecognized transcript layout. Please try converting to TXT/CSV/XLSX or manual entry.');
                setTimeout(() => setUploadStatus(''), 10000);
            }
        } catch (error) {
            console.error("Error reading PDF:", error);
            setUploadStatus('Error reading PDF file. Ensure it\'s a selectable-text PDF, not a scanned image. Try converting to TXT/CSV/XLSX.');
            setTimeout(() => setUploadStatus(''), 10000);
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        // File size check
        if (file.size > MAX_FILE_SIZE) {
            setUploadStatus('File is too large (max 10MB). Please choose a smaller file.');
            setTimeout(() => setUploadStatus(''), 7000);
            return;
        }
        if (file.type === 'application/pdf') {
            handlePdfUpload(file);
        } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            parseCSVTranscript(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            parseExcelTranscript(file);
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            file.text().then(parseTxtOrPdfText).then(parsedCourses => {
                if (parsedCourses.length > 0) {
                    setCourses(parsedCourses);
                    setUploadStatus(`Successfully parsed ${parsedCourses.length} courses from TXT!`);
                    setTimeout(() => setUploadStatus(''), 3000);
                } else {
                    setUploadStatus('No courses found in TXT. Please ensure format is Course Name, Grade%, Credits, Semester or similar Western transcript layout.');
                    setTimeout(() => setUploadStatus(''), 7000);
                }
            }).catch(error => {
                console.error("Error reading TXT:", error);
                setUploadStatus('Error reading TXT file. Please try again or enter courses manually.');
                setTimeout(() => setUploadStatus(''), 5000);
            });
        } else {
            setUploadStatus('Unsupported file type. Please upload a .pdf, .txt, .csv, or .xlsx file.');
            setTimeout(() => setUploadStatus(''), 5000);
        }
    };

    // --- Use Date.now() for unique course IDs ---
    const addCourse = () => {
        const newId = Date.now(); // Ensures unique ID
        setCourses([...courses, {
            id: newId,
            name: '',
            percentage: '',
            credits: '1.0',
            semester: semesters[semesters.length - 1],
            isValid: true
        }]);
    };

    // ... rest of your logic unchanged ...

    // (No changes to removeCourse, updateCourse, calculateGPAs, calculateWhatIf, clearAll, getHonorStatus, or rendering)
    // ... [RENDER LOGIC REMAINS AS IN YOUR ORIGINAL CODE] ...
};

export default WesternGPACalculator;