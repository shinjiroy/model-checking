<?php

namespace Domain\Value\Transition;

use Domain\Value\State\State;
use Domain\Value\Event\Event;

/**
 * 状態遷移
 */
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
