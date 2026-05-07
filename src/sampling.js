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

var results = document.getElementById("results");
var current = {"pairing": null}; // keeps track of current pairings
var last = null; // previous pairing (for avoiding repeats)

// push results to div
function push_results(pairings, number, item) {
    // collect members
    var members = [];
    var keys = Object.keys(pairings);
    for (let i = 0; i < keys.length; i++) {
        if (pairings[keys[i]] == number) {
            members.push({'name': keys[i].slice(1), 'is_f': keys[i][0] == 'f'});
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

    // VARIABLES
    var variables = selected_f.map(i => 'f' + i).concat(selected_m.map(i => 'm' + i));
    shuffle(variables); // solver is deterministic -> add randomization beforehand

    // DOMAINS
    var domains = {};
    var possible_groups = Array.from({length: variables.length}, (_, i) => i + 1);
    for (let i = 0; i < variables.length; i++) {
        domains[variables[i]] = possible_groups;
    }

    // CONSTRAINTS
    function isValid(assignment, variable, value) {
        // e.g. {mM1: 1}, fF1, 1
        var keys = Object.keys(assignment);

        // 1. no repeats
        if (settings.no_repeats && last) {
            if (last[variable] == value) { // cannot be in the same group again
                return false;
            }
        }

        // 2. group sizes
        var current_group_size = Object.values(assignment).reduce((a, v) => (v === value ? a + 1 : a), 0);
        if (current_group_size == settings.group_size) {
            return false;
        }
        if (settings.group_size == 1) {
            return true; // next checks not needed
        }

        // 3. balancing
        if (current_group_size == Math.floor(settings.group_size / 2)) {
            for (let i = 0; i < keys.length; i++) { // find all of current group
                if (assignment[keys[i]] == value && keys[i][0] == variable[0]) {
                    return false;
                }
            }
        }

        // 4. incompatibilities
        var incompatibilities = (variable[0] == 'f' ? data.f : data.m).find(p => p.name == variable.slice(1)).incompatible;
        for (let i = 0; i < keys.length; i++) { // find all of current group
            if (assignment[keys[i]] == value && incompatibilities.includes(keys[i].slice(1))) {
                return false;
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
        current.n_groups = Math.max(...Object.values(pairings));
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
