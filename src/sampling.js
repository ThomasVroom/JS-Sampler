// CSP solver
function solveCSP({
    variables, // Array of variable names
    domains,   // Map: var -> array of possible values
    isValid,   // function(assignment, variable, value) -> boolean
    nextVar,   // function(assignment, variables) -> variable
}) {
    function backtrack(assignment) {
        // if all variables assigned -> solution found
        if (Object.keys(assignment).length === variables.length) {
            return assignment;
        }

        // pick next unassigned variable
        const remaining = variables.filter(v => !(v in assignment));
        const unassigned = nextVar(assignment, remaining);

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

// samples a random element (weighted)
function weighted_sample(items) {
    // sum of weights
    const sum = items.map(item => item.weight).reduce((prev, next) => prev + next);

    // generate random number in [1, sum]
    var r = Math.floor(Math.random() * sum) + 1;

    // assign outcome based on weight
    var cntr = 0;
    for (let i = 0; i < items.length; i++) {
        cntr += items[i].weight;
        if (r <= cntr) { // outcome
            return items[i];
        }
    }
}

// weighted sample of dice items
function dice_sample(data, settings, sampling_args) {
    const items = data.dice[settings.dice].filter((i) => i.domain.includes(sampling_args.person.is_f ? 'f' : 'm'));

    // sample dice
    var d_sample = weighted_sample(items);
    var text = d_sample.text;

    // modifier
    if (settings.modifier) {
        var m_sample = weighted_sample(data.modifiers[settings.modifier]).text;
        if (m_sample) {
            text += (" (" + m_sample + ")");
        }
    }

    // additional sampling
    var additional_samples = [];
    if (settings.additional && d_sample.additional) {
        var do_not_sample = new Set((sampling_args.person.is_f ? data.f : data.m)[sampling_args.person.name].incompatible);
        do_not_sample.add(sampling_args.person.name); // cannot sample self

        // repeat for all elements
        var elem = d_sample.additional.split(" ");
        for (let i = 0; i < elem.length; i++) {
            var range = new Set();
            if (elem[i] == "opp") { // opposite
                range = (sampling_args.person.is_f ? sampling_args.selected_m : sampling_args.selected_f).difference(do_not_sample);
            }
            else if (elem[i] == "f") {
                range = sampling_args.selected_f.difference(do_not_sample);
            }
            else if (elem[i] == "m") {
                range = sampling_args.selected_m.difference(do_not_sample);
            }
            if (range.size > 0) {
                var sampled = Array.from(range)[Math.floor(Math.random() * range.size)];
                do_not_sample.add(sampled); // exclude for same sample procedure
                additional_samples.push(sampled);
            }
        }
    }

    // return text and any additional samples of outcome
    return {"text": text, "additional": additional_samples};
}

// retrieve sampling parameters
function retrieve_settings() {
    let settings = {};
    settings.with_replacement = !String(document.getElementById("sampling-mode").value).startsWith("without");
    settings.group_size = document.getElementById("group-size").value;
    settings.no_repeats = String(document.getElementById("avoid-repeats").value) == "true";
    settings.dice = String(document.getElementById("dice").value);
    if (settings.dice == "none") settings.dice = null;
    settings.additional = String(document.getElementById("additional-sampling").value) == "true";
    settings.modifier = String(document.getElementById("modifier").value);
    if (settings.modifier == "none") settings.modifier = null;
    return settings;
}

var results = document.getElementById("results");
var current = {"pairing": null}; // keeps track of current pairings
var last = null; // previous pairing (for avoiding repeats)

// push results to div
function push_results(pairings, number, data, settings, selected_f, selected_m) {
    // collect members
    var members = [];
    var keys = Object.keys(pairings);
    for (let i = 0; i < keys.length; i++) {
        if (pairings[keys[i]] == number) {
            members.push({'name': keys[i].slice(1), 'is_f': keys[i][0] == 'f'});
        }
    }
    shuffle(members); // add randomization

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
    if (settings.dice) {
        var dice_result = dice_sample(data, settings, {"person": members[0], "selected_f": selected_f, "selected_m": selected_m});
        var dice_item = document.createElement('div');
        dice_item.className = "dice-item";

        // convert to image if url
        if (dice_result.text.startsWith("https://")) {
            var image = document.createElement('img');
            image.className = "image";
            image.src = dice_result.text.split(" ")[0];
            sub_frag.appendChild(image);

            // remove url, keep modifier
            dice_result.text = dice_result.text.endsWith(")") ? dice_result.text.split(" ").slice(1).join(" ") : "";
        }
        dice_item.innerHTML = dice_result.text;

        // additional samples
        var addit = dice_result.additional;
        for (let i = 0; i < addit.length; i++) {
            if (i == 0) dice_item.innerHTML += " → ";
            dice_item.innerHTML += ("<span class=\""+(selected_f.has(addit[i]) ? "f" : "m")+"\">"+addit[i]+"</span>");
            if (i < addit.length - 1) dice_item.innerHTML += ", ";
        }
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
            push_results(current.pairing, current.index, data, settings, selected_f, selected_m);
            current.index++;
        }
        return;
    }

    // reset results
    reset();

    // VARIABLES
    var less_f = selected_f.size < selected_m.size;
    var variables = [...selected_f].map(i => 'f' + i).concat([...selected_m].map(i => 'm' + i));
    shuffle(variables); // solver is deterministic -> add randomization beforehand

    // DOMAINS
    var domains = {};
    var possible_groups = Array.from({length: Math.ceil(variables.length / settings.group_size)}, (_, i) => i + 1).slice(1);
    shuffle(possible_groups); // add randomization
    possible_groups = [1].concat(possible_groups); // ensure 1 is always the first group
    if (settings.group_size == 1) shuffle(possible_groups);
    for (let i = 0; i < variables.length; i++) {
        domains[variables[i]] = possible_groups;
    }

    // CONSTRAINTS
    function isValid(assignment, variable, value) {
        var keys = Object.keys(assignment);
        var values = Object.values(assignment);

        // 1. no repeats in group 1
        if (settings.no_repeats && last && value == 1) {
            if (last[variable] == 1) { // cannot be in group 1 again
                return false;
            }
        }

        // 2. use all groups
        var used_groups = new Set(values);
        if (used_groups.size < possible_groups.length && used_groups.has(value)) {
            return false;
        }

        // 3. group sizes (upper bound)
        var current_group_size = values.reduce((a, v) => (v === value ? a + 1 : a), 0);
        if (current_group_size == settings.group_size) {
            return false;
        }
        if (settings.group_size == 1 || current_group_size == 0) return true; // next checks not needed

        var cntr = 0;
        var exact_match = true;
        var incompatibilities = (variable[0] == 'f' ? data.f : data.m)[variable.slice(1)].incompatible;
        var prev_group = last ? keys.filter(i => last[i] && last[i] == last[variable]) : null;

        // find all of current group
        for (let i = 0; i < keys.length; i++) {
            if (assignment[keys[i]] == value) {
                // 4. incompatibilities
                if (incompatibilities.includes(keys[i].slice(1)) ||
                   (keys[i][0] == 'f' ? data.f : data.m)[keys[i].slice(1)].incompatible.includes(variable.slice(1))) {
                    return false;
                }
                if (!last || !prev_group.includes(keys[i])) exact_match = false;
                if (keys[i][0] == variable[0]) cntr++;
            }
        }

        // 5. no group repeats
        if (!settings.with_replacement && settings.no_repeats && exact_match) {
            return false;
        }

        // 6. balancing
        if (variable[0] == (less_f ? 'f' : 'm') && (cntr + 1) / settings.group_size > 0.67) {
            return false;
        }

        // assignment is valid
        return true;
    }

    // SELECTION
    function nextVar(assignment, variables) {
        if (new Set(Object.values(assignment)).size < possible_groups.length) {
            // fewest first
            return variables.sort((a, b) => ((a[0] == 'f') != less_f) - ((b[0] == 'f') != less_f))[0];
        }
        else {
            // random
            return variables[Math.floor(Math.random() * variables.length)];
        }
    }

    // solve CSP for valid pairings
    const pairings = solveCSP({variables, domains, isValid, nextVar});

    // assert solution was found
    if (!pairings) {
        alert("No solution was found.");
        return;
    }

    // if one group is unbalanced, move to the back
    var count = {};
    Object.values(pairings).forEach(ele => {count[ele] = (count[ele] || 0) + 1;});
    for (let i = 1; i < possible_groups.length; i++) {
        if (count[i] < settings.group_size) {
            for (let j = 0; j < variables.length; j++) {
                if (pairings[variables[j]] == i) pairings[variables[j]] = possible_groups.length;
                else if (pairings[variables[j]] == possible_groups.length) pairings[variables[j]] = i;
            }
            break;
        }
    }

    // save results
    console.log(pairings);
    if (!settings.with_replacement) {
        current.pairing = pairings;
        current.index = 2;
        current.n_groups = possible_groups.length;
    }
    last = pairings;

    // push result
    push_results(pairings, 1, data, settings, selected_f, selected_m);
}

// auto-complete logic
function complete(data, selected_f, selected_m) {
    // get settings
    var settings = retrieve_settings();

    if (!settings.with_replacement) {
        if (current.pairing) { // push all results
            for (; current.index <= current.n_groups; current.index++) {
                push_results(current.pairing, current.index, data, settings, selected_f, selected_m);
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
