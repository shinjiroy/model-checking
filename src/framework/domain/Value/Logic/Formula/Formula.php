<?php

namespace Domain\Value\Logic\Formula;

/**
 * 論理式
 */
interface Formula
{
    public function __invoke(...$args) : bool;
}
