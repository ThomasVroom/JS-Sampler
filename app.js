// load data
const data = await fetch('data.json').then(r => r.json());
console.log("loaded data:", data);

// load presets
const default_preset = "Presets";
const all_presets_f = [default_preset, "All", "None"].concat([...new Set(data.f.flatMap(item => item.presets))].slice(1));
const all_presets_m = [default_preset, "All", "None"].concat([...new Set(data.m.flatMap(item => item.presets))].slice(1));

// selection logic
const selected_f = data.f.map(item => item.name);
const selected_m = data.m.map(item => item.name);
const red = "rgb(200, 0, 0)";
const green = "rgb(0, 200, 0)";
function enable_name(element, is_f) {
    (is_f ? selected_f : selected_m).push(element.textContent);
    element.style.color = green;
}
function disable_name(element, is_f) {
    let i = (is_f ? selected_f : selected_m).indexOf(element.textContent);
    (is_f ? selected_f : selected_m).splice(i, 1);
    element.style.color = red;
}
function toggle_name(element, is_f) {
    (is_f ? selected_f : selected_m).indexOf(element.textContent) == -1 ? enable_name(element, is_f) : disable_name(element, is_f);
}

// add names to lists
var f_list = document.getElementById("f-list");
for (let i = 0; i < data.f.length; i++) {
    var li = document.createElement('li');
    li.appendChild(document.createTextNode(data.f[i].name));
    li.addEventListener("click", function() {toggle_name(this, true)});
    f_list.appendChild(li);
}
var m_list = document.getElementById("m-list");
for (let i = 0; i < data.m.length; i++) {
    var li = document.createElement('li');
    li.appendChild(document.createTextNode(data.m[i].name));
    li.addEventListener("click", function() {toggle_name(this, false)});
    m_list.appendChild(li);
}

// preset logic
function apply_preset(element, is_f) {
    var preset = element.value;
    if (preset == default_preset) return;

    // apply preset
    var list = is_f ? f_list : m_list;
    var d = is_f ? data.f : data.m;
    for (let i = 0; i < list.children.length; i++) {
        d[i].presets.includes(preset) ? enable_name(list.children[i], is_f) : disable_name(list.children[i], is_f);
    }

    // reset element
    element.value = default_preset;
}

// add presets
var f_presets = document.getElementById("f-presets");
for (let i = 0; i < all_presets_f.length; i++) {
    var option = document.createElement('option');
    option.appendChild(document.createTextNode(all_presets_f[i]));
    f_presets.appendChild(option);
}
f_presets.addEventListener("change", () => {apply_preset(f_presets, true)});
var m_presets = document.getElementById("m-presets");
for (let i = 0; i < all_presets_m.length; i++) {
    var option = document.createElement('option');
    option.appendChild(document.createTextNode(all_presets_m[i]));
    m_presets.appendChild(option);
}
m_presets.addEventListener("change", () => {apply_preset(m_presets, false)});

// collapsibles logic
var coll = document.getElementsByClassName("collapsible");
for (let i = 0; i < coll.length; i++) {
    coll[i].addEventListener("click", function() {
        this.classList.toggle("active");
        var content = this.nextElementSibling;
        if (content.style.display === "grid") {
            content.style.display = "none";
        } else {
            content.style.display = "grid";
        }
    });
}

// * * * * * * * *
// SAMPLING LOGIC
// * * * * * * * *
var results = document.getElementById("results");
var current = {"pairing": null}; // keeps track of current pairings
var last = null; // previous pairing (for avoiding repeats)

// CSP solver
function solveCSP({
    variables, // Array of variable names
    domains,   // Map: var -> array of possible values
    isValid,   // function(assignment, variable, value) -> boolean
}) {
    function backtrack(assignment) {
        // if all variables assigned -> solution found
        if (Object.keys(assignment).length === variables.length) {
            return assignment;
        }
        // pick next unassigned variable (MRV)
        const unassigned = variables
            .filter(v => !(v in assignment))
            .sort((a, b) => domains[a].length - domains[b].length)[0];
        for (const value of domains[unassigned]) {
            if (isValid(assignment, unassigned, value)) {
                assignment[unassigned] = value;
                const result = backtrack(assignment);
                if (result) return result;
                delete assignment[unassigned]; // backtrack
            }
        }
        return null; // no solution
    }
    return backtrack({});
}

// Fisher-Yates shuffle (in-place)
function shuffle(array) {
    let currentIndex = array.length;

    // while there remain elements to shuffle
    while (currentIndex != 0) {

        // pick a remaining element
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // swap it with the current element
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
}

// retrieve settings from UI
function retrieve_settings() {
    let settings = {};
    settings.with_replacement = !String(document.getElementById("sampling-mode").value).startsWith("without");
    settings.group_size = document.getElementById("group-size").value;
    settings.min_needed = String(document.getElementById("min-needed").value);
    settings.no_repeats = String(document.getElementById("avoid-repeats").value) == "true";
    return settings;
}

// convert variable string to group number
function to_group(str) {
    return parseInt(str.split('_')[0]);
}

// push results to UI
function push_results(pairings, number) {
    // collect members
    var members = [];
    var keys = Object.keys(pairings);
    for (let i = 0; i < keys.length; i++) {
        if (to_group(keys[i]) == number) {
            members.push({'name': pairings[keys[i]], 'is_f': keys[i].slice(-1) == 'F'});
        }
    }
    shuffle(members); // shuffle results so it feels more random

    // create HTML
    var frag = document.createDocumentFragment();

    // title
    var title = document.createElement('div');
    title.className = "group-title";
    title.innerText = "Group " + number;
    frag.appendChild(title);

    // add members
    var member_list = document.createElement('ul');
    member_list.className = "group-list";
    for (let i = 0; i < members.length; i++) {
        var m = document.createElement('li');
        m.className = members[i].is_f ? "f" : "m";
        m.innerText = members[i].name;
        member_list.appendChild(m);
    }
    frag.appendChild(member_list);

    // push results
    results.appendChild(frag);
}

// reset logic
function reset() {
    current = {"pairing": null};
    results.innerText = ''; // clear results div
}

// main sampling logic
function sample() {
    // get settings
    var settings = retrieve_settings();

    // feed results if already computed
    if (!settings.with_replacement && current.pairing) {
        if (current.index <= current.n_groups) {
            push_results(current.pairing, current.index);
            current.index++;
        }
        return;
    }

    // reset results
    reset();

    var n_f = selected_f.length;
    var n_m = selected_m.length;
    var min_needed = settings.min_needed == "auto" ? Math.floor(settings.group_size / 2) : parseInt(settings.min_needed);
    var group = 1;

    // VARIABLES
    var variables = [];
    for (; true; group++) {
        var less_f = (n_f == n_m ? Math.random() < 0.5 : n_f < n_m);
        if ((less_f ? n_f : n_m) >= min_needed && (less_f ? n_m : n_f) >= settings.group_size - min_needed) {
            for (let i = 0; i < settings.group_size; i++) {
                variables.push(group+'_'+i+(i < min_needed ? (less_f ? 'F' : 'M') : (less_f ? 'M' : 'F')));
            }
            n_f -= less_f ? min_needed : settings.group_size - min_needed;
            n_m -= less_f ? settings.group_size - min_needed : min_needed;
        }
        else { // no more groups possible
            break;
        }
    }

    // assert selection is possible
    if (variables.length < 2) {
        window.alert("Selection not valid.");
        return;
    }

    // DOMAINS
    var domains = {};
    for (let i = 0; i < variables.length; i++) {
        domains[variables[i]] = [...(variables[i].endsWith('F') ? selected_f : selected_m)];
        shuffle(domains[variables[i]]); // solver is deterministic -> add randomization beforehand
    }

    // CONSTRAINTS
    function isValid(assignment, variable, value) {
        // e.g. {1_0M: M1}, 2_0F, M2

        // 1. no duplicate people
        if (Object.values(assignment).includes(value)) {
            return false;
        }

        // 2. incompatibilities
        var current_group = to_group(variable);
        var current_person = (variable.endsWith('F') ? data.f : data.m).find(p => p.name == value);
        var keys = Object.keys(assignment);
        for (let i = 0; i < keys.length; i++) {
            if (to_group(keys[i]) == current_group) {
                if (current_person.incompatible.includes(assignment[keys[i]])) {
                    return false;
                }
            }
        }

        // 3. no repeats
        if (settings.no_repeats && last) {
            var last_keys = Object.keys(last);
            var prev_group = last_keys.find(key => last[key] == value);
            if (prev_group) {
                prev_group = to_group(prev_group); // previous group of value
                var perfect_match = true;
                for (let i = 0; i < last_keys.length; i++) {
                    if (to_group(last_keys[i]) == prev_group && last[last_keys[i]] != value) { // loop over all people in past group of value
                        var new_group = keys.find(key => assignment[key] == last[last_keys[i]]); // current group of person in past group of value
                        if (new_group) {
                            if (to_group(new_group) != current_group) {
                                perfect_match = false;
                                break;
                            }
                        }
                        else { // person is not assigned
                            perfect_match = false;
                            break;
                        }
                    }
                }
                if (perfect_match) { // no whole-group repeats
                    return false;
                }
            }
        }

        // assignment is valid
        return true;
    }

    // solve CSP for valid pairings
    const pairings = solveCSP({variables, domains, isValid});
    console.log(pairings);

    // assert solution was found
    if (!pairings) {
        window.alert("No solution was found.");
        return;
    }

    // save results
    if (!settings.with_replacement) {
        current.pairing = pairings;
        current.index = 2;
        current.n_groups = group-1;
    }
    last = pairings;

    // push result
    push_results(pairings, 1);
}

// auto-complete logic
function complete() {
    // get settings
    var settings = retrieve_settings();

    if (!settings.with_replacement) {
        if (current.pairing) { // push all results
            for (; current.index <= current.n_groups; current.index++) {
                push_results(current.pairing, current.index);
            }
        }
        else {
            sample();
            if (current.pairing) { // if sample was successful
                complete();
            }
        }
    }
}

// add logic to buttons
var main_button = document.getElementById("main-button");
main_button.addEventListener("click", sample);
var reset_button = document.getElementById("reset-button");
reset_button.addEventListener("click", reset);
var complete_button = document.getElementById("complete-button");
complete_button.addEventListener("click", complete);
