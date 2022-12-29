<?php

namespace Domain\Value\Event;

/**
 * 状態遷移イベント
 */
class Event
{
    protected string $label;
    public function getLabel() : string
    {
        return $this->label;
    }

    public function __construct(string $label)
    {
        $this->label = $label;
    }
}
