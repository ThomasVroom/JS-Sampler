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

// weighted sample of dice items
function dice_sample(data, index) {
    if (index > 0) {
        const items = data.dice[index-1].items;
        const sum = items.map(item => item.weight).reduce((prev, next) => prev + next);

        // generate random number in [1, sum]
        var r = Math.floor(Math.random() * sum) + 1;

        // assign outcome based on weight
        var cntr = 0;
        for (let i = 0; i < items.length; i++) {
            cntr += items[i].weight;
            if (r <= cntr) {
                return items[i].text;
            }
        }
    }
    return null;
}

// retrieve parameters
function retrieve_settings() {
    let settings = {};
    settings.with_replacement = !String(document.getElementById("sampling-mode").value).startsWith("without");
    settings.group_size = document.getElementById("group-size").value;
    settings.no_repeats = String(document.getElementById("avoid-repeats").value) == "true";
    settings.dice = document.getElementById("dice").selectedIndex;
    return settings;
}

// convert variable string to group number
function to_group(str) {
    return parseInt(str.split('_')[0]);
}

var results = document.getElementById("results");
var current = {"pairing": null}; // keeps track of current pairings
var last = null; // previous pairing (for avoiding repeats)

// push results to div
function push_results(pairings, number, item) {
    // collect members
    var members = [];
    var keys = Object.keys(pairings);
    for (let i = 0; i < keys.length; i++) {
        if (to_group(keys[i]) == number) {
            members.push({'name': pairings[keys[i]], 'is_f': keys[i].slice(-1) == 'F'});
        }
    }

    // create HTML
    var frag = document.createDocumentFragment();
    var sub_frag = document.createElement('div');
    sub_frag.className = "sub-result";

    // title
    var title = document.createElement('div');
    title.className = "group-title";
    title.innerText = "Group " + number;
    sub_frag.appendChild(title);

    // add members
    var member_list = document.createElement('ul');
    member_list.className = "group-list";
    for (let i = 0; i < members.length; i++) {
        var m = document.createElement('li');
        m.className = members[i].is_f ? "f" : "m";
        m.innerText = members[i].name;
        member_list.appendChild(m);
    }
    sub_frag.appendChild(member_list);

    // add dice item
    if (item) {
        var dice_item = document.createElement('div');
        dice_item.className = "dice-item";
        dice_item.innerText = members[0].is_f ? item.f : item.m;
        sub_frag.appendChild(dice_item);
    }

    // push results
    frag.appendChild(sub_frag);
    results.appendChild(frag);
}

// reset logic
function reset() {
    current = {"pairing": null};
    results.innerText = ''; // clear results div
}

// main sampling logic
function sample(data, selected_f, selected_m) {
    // get settings
    var settings = retrieve_settings();

    // feed results if already computed
    if (!settings.with_replacement && current.pairing) {
        if (current.index <= current.n_groups) {
            push_results(current.pairing, current.index, dice_sample(data, settings.dice));
            current.index++;
        }
        return;
    }

    // reset results
    reset();

    var n_f = selected_f.length;
    var n_m = selected_m.length;
    var min_needed = Math.floor(settings.group_size / 2);
    var group = 1;

    // VARIABLES
    var variables = [];
    for (; settings.with_replacement ? group < 2 : true; group++) {
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
        alert("Selection not valid.");
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
                if (prev_group == current_group) { // cannot be put in the same group again
                    return false;
                }
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
        alert("No solution was found.");
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
    push_results(pairings, 1, dice_sample(data, settings.dice));
}

// auto-complete logic
function complete(data, selected_f, selected_m) {
    // get settings
    var settings = retrieve_settings();

    if (!settings.with_replacement) {
        if (current.pairing) { // push all results
            for (; current.index <= current.n_groups; current.index++) {
                push_results(current.pairing, current.index, dice_sample(data, settings.dice));
            }
        }
        else {
            sample(data, selected_f, selected_m);
            if (current.pairing) { // if sample was successful
                complete(data, selected_f, selected_m);
            }
        }
    }
}
