export var RunEvent;
(function (RunEvent) {
    RunEvent["RunStarted"] = "RunStarted";
    RunEvent["RunContent"] = "RunContent";
    RunEvent["RunCompleted"] = "RunCompleted";
    RunEvent["RunError"] = "RunError";
    RunEvent["TeamRunStarted"] = "TeamRunStarted";
    RunEvent["TeamRunContent"] = "TeamRunContent";
    RunEvent["TeamRunCompleted"] = "TeamRunCompleted";
    RunEvent["TeamRunError"] = "TeamRunError";
})(RunEvent || (RunEvent = {}));
