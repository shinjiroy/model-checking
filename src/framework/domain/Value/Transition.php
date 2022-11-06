<?php

namespace Domain\Value;

class Transition
{
    protected State $from;
    protected Event $event;
    protected State $to;

    public function __construct(State $from, Event $event, State $to)
    {
        $this->from = $from;
        $this->event = $event;
        $this->to = $to;
    }
}
