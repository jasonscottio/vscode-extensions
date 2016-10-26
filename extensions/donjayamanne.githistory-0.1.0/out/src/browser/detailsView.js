"use strict";
(function () {
    var logEntries;
    var $logView;
    var $detailsView;
    var $fileListTemplate;
    window.GITHISTORY.initializeDetailsView = function () {
        $logView = $('#log-view');
        $detailsView = $('#details-view');
        $fileListTemplate = $('.diff-row', $detailsView);
        logEntries = JSON.parse(document.querySelectorAll('div.json.entries')[0].innerHTML);
        addEventHandlers();
    };
    function addEventHandlers() {
        $('.commit-subject-link', $logView).addClass('hidden');
        // delegate the events
        $logView
            .on('click', '.commit-subject', function (evt) {
            var entryIndex = evt.target.getAttribute('data-entry-index');
            displayDetails(logEntries[parseInt(entryIndex)], event.target);
        })
            .on('click', '.commit-hash', function (evt) {
            var entryIndex = evt.target.getAttribute('data-entry-index');
            var $logEntry = $(evt.target).closest('.log-entry');
            displayDetails(logEntries[parseInt(entryIndex)], event.target);
        });
        $detailsView
            .on('click', '.close-btn', hideDetails);
    }
    var detailsViewShown = false;
    function displayDetails(entry, eventTarget) {
        var $logEntry = $(eventTarget).closest('.log-entry');
        // mark this log entry as selected
        $('.log-entry', $logView).removeClass('active');
        $logEntry.addClass('active');
        if (!detailsViewShown) {
            $logView.addClass('with-details');
            $logView.animate({
                scrollTop: $logEntry.offset().top - $logView.offset().top + $logView.scrollTop()
            });
            $detailsView.removeClass('hidden');
        }
        $('.commit-subject', $detailsView).html(entry.subject);
        $('.commit-author .name', $detailsView)
            .attr('aria-label', entry.author.email)
            .html(entry.author.name);
        $('.commit-author .timestamp', $detailsView)
            .html(moment(entry.author.date).format('[on ]MMM Do YYYY, h:mm:ss a'));
        $('.commit-body', $detailsView)
            .html(entry.body);
        $('.commit-notes', $detailsView).html(entry.notes);
        var $files = $('.committed-files', $detailsView);
        $files.html('');
        entry.fileStats.forEach(function (stat) {
            var $fileItem = $fileListTemplate.clone(false);
            var additions = stat.additions, deletions = stat.deletions;
            var totalDiffs = additions + deletions;
            if (totalDiffs > 5) {
                additions = Math.ceil(5 * additions / totalDiffs);
                deletions = 5 - additions;
            }
            /* show the original number of changes in the title and count */
            $('.diff-stats', $fileItem).attr('aria-label', "added " + stat.additions + " & deleted " + stat.deletions);
            $('.diff-count', $fileItem).html(totalDiffs.toString());
            /* colour the blocks in addition:deletion ratio */
            $('.diff-block', $fileItem).each(function (index, el) {
                var $el = $(el);
                if (index < additions) {
                    $el.addClass('added');
                }
                else if (index < totalDiffs) {
                    $el.addClass('deleted');
                }
            });
            $('.file-name', $fileItem).html(stat.path);
            var uri = encodeURI('command:git.viewFileCommitDetails?' + JSON.stringify([entry.sha1.full, stat.path, moment(entry.author.date).format('YYYY-MM-DD HH:mm:ss ZZ')]));
            $('.file-name', $fileItem).attr('href', uri);
            $files.append($fileItem);
        });
    }
    function hideDetails() {
        detailsViewShown = false;
        $detailsView.addClass('hidden');
        $logView.removeClass('with-details');
    }
})();
//# sourceMappingURL=detailsView.js.map