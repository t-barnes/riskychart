const calendar = document.getElementById("calendar");
const dialog = document.getElementById("day-dialog");

const nameInput = document.getElementById("participant-name");
const completionStatus = document.getElementById("completion-status");
const submitButton = document.getElementById("submit-availability");
const submitMessage = document.getElementById("submit-message");

const selectedDateHeading = document.getElementById("selected-date");
const startSelect = document.getElementById("start-time");
const endSelect = document.getElementById("end-time");

const addRangeButton = document.getElementById("add-range");
const currentRanges = document.getElementById("current-ranges");
const rangeError = document.getElementById("range-error");

const allDayButton = document.getElementById("all-day");
const clearButton = document.getElementById("clear-day");

const closeButton = document.getElementById("close-day");
const cancelButton = document.getElementById("cancel-day");
const saveButton = document.getElementById("save-day");


const FIRST_DATE = "2026-08-28";
const LAST_DATE = "2026-09-08";
const TOTAL_DAYS = 12;

const supabaseClient = window.supabase.createClient(
    window.RISKYCHART_SUPABASE_URL,
    window.RISKYCHART_SUPABASE_KEY
);


/*
    Local availability while we build the page.

    Later we will send this object to Supabase.
*/
const availability = {};

let activeDate = null;
let workingRanges = [];
let workingUnavailable = false;


const months = [
    {
        year: 2026,
        month: 7,
        title: "August 2026"
    },
    {
        year: 2026,
        month: 8,
        title: "September 2026"
    }
];


const weekdayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
];


function pad(number) {
    return String(number).padStart(2, "0");
}


function dateKey(year, month, day) {
    return `${year}-${pad(month + 1)}-${pad(day)}`;
}


function isActiveDate(key) {
    return key >= FIRST_DATE && key <= LAST_DATE;
}


function prettyDate(key) {

    const [year, month, day] = key.split("-").map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    return new Intl.DateTimeFormat(
        "en-US",
        {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC"
        }
    ).format(date);
}


function minutesToValue(minutes) {

    if (minutes === 1440) {
        return "24:00";
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${pad(hours)}:${pad(mins)}`;
}


function valueToMinutes(value) {

    if (value === "24:00") {
        return 1440;
    }

    const [hours, minutes] = value
        .split(":")
        .map(Number);

    return (hours * 60) + minutes;
}


function formatTime(value) {

    const minutes = valueToMinutes(value);

    if (minutes === 1440) {
        return "12:00 AM";
    }

    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const suffix = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;

    if (hours === 0) {
        hours = 12;
    }

    return `${hours}:${pad(mins)} ${suffix}`;
}


function buildTimeMenus() {

    startSelect.innerHTML = "";
    endSelect.innerHTML = "";

    for (let minutes = 480; minutes < 1440; minutes += 30) {

        const value = minutesToValue(minutes);

        const option = document.createElement("option");

        option.value = value;
        option.textContent = formatTime(value);

        startSelect.appendChild(option);
    }


    for (let minutes = 510; minutes <= 1440; minutes += 30) {

        const value = minutesToValue(minutes);

        const option = document.createElement("option");

        option.value = value;
        option.textContent = formatTime(value);

        endSelect.appendChild(option);
    }


    startSelect.value = "18:00";
    endSelect.value = "22:00";
}


function buildCalendar() {

    calendar.innerHTML = "";

    months.forEach(monthInfo => {

        const monthElement = document.createElement("section");
        monthElement.className = "month";

        const title = document.createElement("h3");
        title.textContent = monthInfo.title;

        monthElement.appendChild(title);


        const weekdays = document.createElement("div");
        weekdays.className = "weekdays";

        weekdayNames.forEach(name => {

            const day = document.createElement("div");

            day.className = "weekday";
            day.textContent = name;

            weekdays.appendChild(day);
        });

        monthElement.appendChild(weekdays);


        const days = document.createElement("div");
        days.className = "days";


        const firstDay = new Date(
            Date.UTC(
                monthInfo.year,
                monthInfo.month,
                1
            )
        ).getUTCDay();


        for (let index = 0; index < firstDay; index++) {

            const blank = document.createElement("div");
            blank.className = "blank-day";

            days.appendChild(blank);
        }


        const numberOfDays = new Date(
            Date.UTC(
                monthInfo.year,
                monthInfo.month + 1,
                0
            )
        ).getUTCDate();


        for (let day = 1; day <= numberOfDays; day++) {

            const key = dateKey(
                monthInfo.year,
                monthInfo.month,
                day
            );

            const button = document.createElement("button");

            button.type = "button";
            button.className = "day-button";

            const number = document.createElement("span");
            number.className = "day-number";
            number.textContent = day;

            const status = document.createElement("span");
            status.className = "day-status";

            button.appendChild(number);
            button.appendChild(status);


            if (!isActiveDate(key)) {

                button.disabled = true;

            } else {

                button.addEventListener(
                    "click",
                    () => openDay(key)
                );


                const saved = availability[key];

                if (saved) {

                    if (saved.status === "unavailable") {

                        button.classList.add(
                            "completed",
                            "unavailable"
                        );

                        status.textContent = "Unavailable";

                    } else {

                        button.classList.add("completed");
                        status.textContent = "✓ Saved";
                    }

                } else {

                    status.textContent = "Select";
                }
            }


            days.appendChild(button);
        }


        monthElement.appendChild(days);
        calendar.appendChild(monthElement);
    });
}


function openDay(key) {

    activeDate = key;

    const saved = availability[key];

    workingRanges = saved?.ranges
        ? saved.ranges.map(range => ({ ...range }))
        : [];

    workingUnavailable =
        saved?.status === "unavailable";


    selectedDateHeading.textContent = prettyDate(key);

    rangeError.textContent = "";

    renderWorkingRanges();

    dialog.showModal();
}


function mergeRanges(ranges) {

    if (!ranges.length) {
        return [];
    }


    const sorted = ranges
        .map(range => ({
            start: valueToMinutes(range.start),
            end: valueToMinutes(range.end)
        }))
        .sort((a, b) => a.start - b.start);


    const merged = [sorted[0]];


    for (let index = 1; index < sorted.length; index++) {

        const current = sorted[index];
        const previous = merged[merged.length - 1];


        if (current.start <= previous.end) {

            previous.end = Math.max(
                previous.end,
                current.end
            );

        } else {

            merged.push(current);
        }
    }


    return merged.map(range => ({
        start: minutesToValue(range.start),
        end: minutesToValue(range.end)
    }));
}


function renderWorkingRanges() {

    currentRanges.innerHTML = "";


    if (workingUnavailable) {

        const message = document.createElement("div");

        message.className = "unavailable-message";
        message.textContent = "Unavailable all day";

        currentRanges.appendChild(message);

        return;
    }


    if (!workingRanges.length) {

        const message = document.createElement("div");

        message.className = "empty-message";
        message.textContent =
            "No availability ranges added yet.";

        currentRanges.appendChild(message);

        return;
    }


    workingRanges.forEach((range, index) => {

        const row = document.createElement("div");
        row.className = "range-row";


        const text = document.createElement("span");

        text.textContent =
            `${formatTime(range.start)} – ${formatTime(range.end)}`;


        const remove = document.createElement("button");

        remove.type = "button";
        remove.className = "remove-range";
        remove.textContent = "Remove";


        remove.addEventListener(
            "click",
            () => {

                workingRanges.splice(index, 1);

                renderWorkingRanges();
            }
        );


        row.appendChild(text);
        row.appendChild(remove);

        currentRanges.appendChild(row);
    });
}


addRangeButton.addEventListener(
    "click",
    () => {

        rangeError.textContent = "";

        const start = startSelect.value;
        const end = endSelect.value;


        if (
            valueToMinutes(end) <=
            valueToMinutes(start)
        ) {

            rangeError.textContent =
                "End time must be later than start time.";

            return;
        }


        workingUnavailable = false;

        workingRanges.push({
            start,
            end
        });


        workingRanges =
            mergeRanges(workingRanges);


        renderWorkingRanges();
    }
);


allDayButton.addEventListener(
    "click",
    () => {

        workingUnavailable = false;

        workingRanges = [
            {
                start: "00:00",
                end: "24:00"
            }
        ];

        rangeError.textContent = "";

        renderWorkingRanges();
    }
);


clearButton.addEventListener(
    "click",
    () => {

        workingUnavailable = false;
        workingRanges = [];

        rangeError.textContent = "";

        renderWorkingRanges();
    }
);


saveButton.addEventListener(
    "click",
    () => {

        rangeError.textContent = "";


        if (
            !workingUnavailable &&
            workingRanges.length === 0
        ) {

            rangeError.textContent =
                "Add an availability range or choose Unavailable All Day.";

            return;
        }


        if (workingUnavailable) {

            availability[activeDate] = {
                status: "unavailable",
                ranges: []
            };

        } else {

            availability[activeDate] = {
                status: "available",
                ranges: workingRanges.map(
                    range => ({ ...range })
                )
            };
        }


        dialog.close();

        buildCalendar();
        updateProgress();
    }
);


function closeDialog() {
    dialog.close();
}


closeButton.addEventListener(
    "click",
    closeDialog
);

cancelButton.addEventListener(
    "click",
    closeDialog
);


function updateProgress() {

    const completed =
        Object.keys(availability).length;


    completionStatus.textContent =
        `${completed} of ${TOTAL_DAYS} days entered`;


    const nameReady =
        nameInput.value.trim().length > 0;


    submitButton.disabled =
        completed === 0 ||
        !nameReady;
}


nameInput.addEventListener(
    "input",
    updateProgress
);


submitButton.addEventListener(
    "click",
    async () => {

        const name = nameInput.value.trim();

        if (!name) {
            submitMessage.textContent =
                "Enter your name before submitting.";
            return;
        }


        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
        submitMessage.textContent = "";


        const { error } = await supabaseClient
            .from("draft_submissions")
            .upsert(
                {
                    name: name,
                    availability: availability,
                    submitted_at: new Date().toISOString()
                },
                {
                    onConflict: "name"
                }
            );


        if (error) {

            console.error(error);

            submitMessage.textContent =
                "Submission failed: " + error.message;

        } else {

            submitMessage.textContent =
                "Availability submitted successfully.";

            await loadMasterAvailability();

        }


        submitButton.textContent = "Submit Availability";

        updateProgress();
    }
);


buildTimeMenus();
buildCalendar();
updateProgress();







/* ==================================================
   MASTER AVAILABILITY
   ================================================== */

const masterResults =
    document.getElementById("master-results");

const masterSummary =
    document.getElementById("master-summary");

const refreshMasterButton =
    document.getElementById("refresh-master");


function getDraftDates() {

    const dates = [];

    let current = new Date(
        Date.UTC(2026, 7, 28)
    );

    const end = new Date(
        Date.UTC(2026, 8, 8)
    );

    while (current <= end) {

        dates.push(
            current.toISOString().slice(0, 10)
        );

        current.setUTCDate(
            current.getUTCDate() + 1
        );
    }

    return dates;
}


function userAvailableForSlot(
    dayData,
    slotStart,
    slotEnd
) {

    if (!dayData) {
        return false;
    }

    if (dayData.status !== "available") {
        return false;
    }

    if (!Array.isArray(dayData.ranges)) {
        return false;
    }

    return dayData.ranges.some(range => {

        const rangeStart =
            valueToMinutes(range.start);

        const rangeEnd =
            valueToMinutes(range.end);

        return (
            slotStart >= rangeStart &&
            slotEnd <= rangeEnd
        );
    });
}


function calculateAvailabilityRanges(
    submissions,
    date
) {

    const slots = [];

    for (
        let start = 0;
        start < 1440;
        start += 30
    ) {

        const end = start + 30;

        const availableNames = [];
        const unavailableNames = [];


        submissions.forEach(submission => {

            const dayData =
                submission.availability?.[date];

            const available =
                userAvailableForSlot(
                    dayData,
                    start,
                    end
                );

            if (available) {

                availableNames.push(
                    submission.name
                );

            } else {

                unavailableNames.push(
                    submission.name
                );
            }
        });


        slots.push({
            date,
            start,
            end,
            availableNames,
            unavailableNames,
            count: availableNames.length,
            total: submissions.length
        });
    }


    /*
        Merge adjoining 30-minute periods
        when exactly the same players are available.
    */

    const merged = [];

    slots.forEach(slot => {

        const previous =
            merged[merged.length - 1];

        const signature =
            slot.availableNames.join("|");

        const previousSignature =
            previous
                ? previous.availableNames.join("|")
                : null;


        if (
            previous &&
            previous.end === slot.start &&
            signature === previousSignature
        ) {

            previous.end = slot.end;

        } else {

            merged.push({
                ...slot,
                availableNames:
                    [...slot.availableNames],

                unavailableNames:
                    [...slot.unavailableNames]
            });
        }
    });


    return merged;
}


function createAvailabilityRange(
    range,
    total,
    showDate = false
) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "master-range-row";


    if (range.count === total) {

        wrapper.classList.add(
            "perfect-match"
        );
    }


    if (showDate) {

        const date =
            document.createElement("div");

        date.className =
            "near-match-date";

        date.textContent =
            prettyDate(range.date);

        wrapper.appendChild(date);
    }


    const top =
        document.createElement("div");

    top.className =
        "master-range-top";


    const time =
        document.createElement("span");

    time.className =
        "master-time";

    time.textContent =
        `${formatTime(
            minutesToValue(range.start)
        )} – ${formatTime(
            minutesToValue(range.end)
        )}`;


    const count =
        document.createElement("span");

    count.className =
        "master-count";

    count.textContent =
        `${range.count} / ${total} available`;


    top.appendChild(time);
    top.appendChild(count);

    wrapper.appendChild(top);


    if (range.count === total) {

        const everyone =
            document.createElement("div");

        everyone.className =
            "everyone-label";

        everyone.textContent =
            "Everyone is available";

        wrapper.appendChild(everyone);

    } else {

        const missing =
            document.createElement("div");

        missing.className =
            "missing-people";

        missing.textContent =
            "Unavailable: " +
            range.unavailableNames.join(", ");

        wrapper.appendChild(missing);
    }


    return wrapper;
}


function createSectionHeading(
    title,
    subtitle = ""
) {

    const heading =
        document.createElement("div");

    heading.className =
        "availability-group-heading";


    const titleElement =
        document.createElement("h3");

    titleElement.textContent = title;

    heading.appendChild(
        titleElement
    );


    if (subtitle) {

        const subtitleElement =
            document.createElement("p");

        subtitleElement.textContent =
            subtitle;

        heading.appendChild(
            subtitleElement
        );
    }


    return heading;
}


async function loadMasterAvailability() {

    masterSummary.textContent =
        "Loading submitted calendars...";

    masterResults.innerHTML = "";


    const { data, error } =
        await supabaseClient
            .from("draft_submissions")
            .select("name, availability")
            .order("name");


    if (error) {

        console.error(error);

        masterSummary.textContent =
            "Could not load submitted calendars.";

        masterResults.innerHTML =
            '<div class="master-empty">' +
            error.message +
            '</div>';

        return;
    }


    if (!data || data.length === 0) {

        masterSummary.textContent =
            "No calendars have been submitted yet.";

        masterResults.innerHTML =
            '<div class="master-empty">' +
            'Shared availability will appear here after someone submits.' +
            '</div>';

        return;
    }


    const total = data.length;

    masterSummary.textContent =
        `${total} submitted ${
            total === 1
                ? "player"
                : "players"
        }`;


    const dates =
        getDraftDates();


    /*
        Gather every usable availability range
        across every date.
    */

    const allRanges = [];

    dates.forEach(date => {

        const ranges =
            calculateAvailabilityRanges(
                data,
                date
            );

        ranges
            .filter(range =>
                range.count > 0
            )
            .forEach(range => {

                allRanges.push(range);

            });
    });


    /*
        ==================================================
        100% MATCHES
        ==================================================
    */

    const perfectRanges =
        allRanges.filter(
            range =>
                range.count === total
        );


    const perfectSection =
        document.createElement("section");

    perfectSection.className =
        "availability-result-group";


    perfectSection.appendChild(
        createSectionHeading(
            "Everyone Available",
            `${total} out of ${total} players`
        )
    );


    if (perfectRanges.length === 0) {

        const none =
            document.createElement("div");

        none.className =
            "master-empty";

        none.textContent =
            "There is currently no time when every player is available.";

        perfectSection.appendChild(
            none
        );

    } else {


        dates.forEach(date => {

            const dateRanges =
                perfectRanges.filter(
                    range =>
                        range.date === date
                );


            if (!dateRanges.length) {
                return;
            }


            const day =
                document.createElement("div");

            day.className =
                "master-day";


            const heading =
                document.createElement("h3");

            heading.textContent =
                prettyDate(date);

            day.appendChild(
                heading
            );


            dateRanges.forEach(range => {

                day.appendChild(
                    createAvailabilityRange(
                        range,
                        total
                    )
                );
            });


            perfectSection.appendChild(
                day
            );
        });
    }


    masterResults.appendChild(
        perfectSection
    );


    /*
        ==================================================
        BEST LESS-THAN-100% MATCHES
        ==================================================
    */

    const partialRanges =
        allRanges.filter(
            range =>
                range.count > 0 &&
                range.count < total
        );


    if (partialRanges.length === 0) {
        return;
    }


    const nearMatchSection =
        document.createElement("section");

    nearMatchSection.className =
        "availability-result-group near-match-section";


    nearMatchSection.appendChild(
        createSectionHeading(
            "Best Near-Matches",
            "Best options when not every player can attend"
        )
    );


    /*
        Find unique player counts, highest first.

        Example:
        7/8
        6/8
        5/8

        Show all matching levels, highest availability first.
    */

    const matchLevels =
        [
            ...new Set(
                partialRanges.map(
                    range => range.count
                )
            )
        ]
        .sort((a, b) => b - a);


    matchLevels.forEach(
        playerCount => {


        const group =
            document.createElement("div");

        group.className =
            "near-match-group";


        const groupHeading =
            document.createElement("h3");

        groupHeading.className =
            "near-match-heading";

        groupHeading.textContent =
            `${playerCount} out of ${total} players`;

        group.appendChild(
            groupHeading
        );


        const matches =
            partialRanges
                .filter(
                    range =>
                        range.count ===
                        playerCount
                )
                .sort(
                    (a, b) => {

                        /*
                            Longer ranges first
                            within the same match level.
                        */

                        const aDuration =
                            a.end - a.start;

                        const bDuration =
                            b.end - b.start;

                        if (
                            bDuration !==
                            aDuration
                        ) {

                            return (
                                bDuration -
                                aDuration
                            );
                        }


                        /*
                            Then earlier dates.
                        */

                        if (
                            a.date !==
                            b.date
                        ) {

                            return a.date
                                .localeCompare(
                                    b.date
                                );
                        }


                        return (
                            a.start -
                            b.start
                        );
                    }
                );


        matches.forEach(range => {

            group.appendChild(
                createAvailabilityRange(
                    range,
                    total,
                    true
                )
            );
        });


        nearMatchSection.appendChild(
            group
        );
    });


    masterResults.appendChild(
        nearMatchSection
    );
}


refreshMasterButton.addEventListener(
    "click",
    loadMasterAvailability
);


loadMasterAvailability();



